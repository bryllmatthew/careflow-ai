"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { generateLinkToken } from "@/lib/booking/links";
import {
  bookingSlugSchema,
  bookingSettingsSchema,
  bookingLinkSchema,
  operatingHoursSchema,
  publicServiceSchema,
  publicPractitionerSchema,
  type BookingSettingsInput,
  type BookingLinkInput,
  type OperatingHours,
  type PublicServiceInput,
  type PublicPractitionerInput,
} from "@/lib/validation/booking.schema";

type ActionResult = { error?: string };

const BRANDING_BUCKET = "clinic-branding";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

/** Postgres unique_violation -- here, a slug another clinic already holds. */
const UNIQUE_VIOLATION = "23505";

function revalidateBooking(clinicId: string) {
  revalidatePath("/booking");
  revalidatePath(`/booking/${clinicId}`);
}

/**
 * Writes an audit row for a booking administration action.
 *
 * Never fails the action it records: an audit write that could roll back a
 * successful configuration change would make the log the most fragile part of
 * the system. Failures are logged where an operator can find them, the same
 * "side effect, not the point of the request" rule
 * app/(app)/appointments/actions.ts applies to automation.
 */
async function audit(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  organizationId: string,
  action: string,
  clinicId: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await supabase.rpc("log_audit_event", {
      p_organization_id: organizationId,
      p_action: action,
      p_entity_type: "clinic",
      p_entity_id: clinicId,
      p_metadata: { ...metadata, clinic_id: clinicId },
    });
  } catch (err) {
    console.error(`[booking] audit write failed for ${action}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export async function setClinicSlugAction(clinicId: string, slug: string): Promise<ActionResult> {
  const parsed = bookingSlugSchema.safeParse(slug);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That booking link isn't valid." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("booking.manage", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("clinics").update({ slug: parsed.data }).eq("id", clinicId);

  if (error) {
    // The slug is globally unique, so a clash may be with a clinic in another
    // organization the caller cannot see. The message says what to do without
    // confirming that some other tenant holds it.
    return {
      error:
        error.code === UNIQUE_VIOLATION
          ? "That booking link is already taken. Try a different one."
          : error.message,
    };
  }

  await audit(supabase, organizationId, "booking.slug_updated", clinicId, { slug: parsed.data });
  revalidateBooking(clinicId);
  return {};
}

/**
 * Magic-byte signatures for the three formats the bucket accepts.
 *
 * The brief (section 3) is explicit that the client-declared MIME type must
 * not be trusted on its own, and it is right to be: `file.type` is whatever
 * the browser or a hand-rolled request says it is. The bucket enforces its own
 * allowed_mime_types (migration 0021) against that same untrusted header, so
 * this check -- reading the actual first bytes -- is the one that cannot be
 * talked out of a decision.
 */
const IMAGE_SIGNATURES: { ext: string; mime: string; test: (b: Uint8Array) => boolean }[] = [
  {
    ext: "png",
    mime: "image/png",
    test: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: "jpg",
    mime: "image/jpeg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    // RIFF....WEBP
    ext: "webp",
    mime: "image/webp",
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function uploadClinicLogoAction(
  clinicId: string,
  formData: FormData,
): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  // Branding is a clinic detail, so it reuses clinic.update rather than a
  // separate permission -- see migration 0019's permissions comment.
  await requirePermission("clinic.update", { organizationId, clinicId });

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file to upload." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "That image is larger than 5 MB. Please use a smaller one." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = IMAGE_SIGNATURES.find((s) => s.test(bytes));
  if (!signature) {
    return { error: "Use a PNG, JPG or WEBP image." };
  }

  const supabase = await getSupabaseServerClient();

  // Read the current logo first so the old object can be removed only after
  // the new one is safely in place -- a failed upload must never leave the
  // clinic with no logo.
  const { data: clinic } = await supabase
    .from("clinics")
    .select("logo_url")
    .eq("id", clinicId)
    .maybeSingle();

  // Random object name, not "logo.png": a stable name would be served stale by
  // the storage CDN after a replacement, and the whole point of this feature is
  // that a replaced logo shows up immediately on the public page.
  const objectPath = `${organizationId}/${clinicId}/${crypto.randomUUID()}.${signature.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(objectPath, bytes, { contentType: signature.mime, upsert: false });

  if (uploadError) {
    return { error: `Couldn't upload that image: ${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(objectPath);

  const { error: updateError } = await supabase
    .from("clinics")
    .update({ logo_url: publicUrl })
    .eq("id", clinicId);

  if (updateError) {
    // Roll the orphaned object back rather than leaving it billed and
    // unreferenced.
    await supabase.storage.from(BRANDING_BUCKET).remove([objectPath]);
    return { error: updateError.message };
  }

  const previous = objectPathFromPublicUrl(clinic?.logo_url ?? null);
  if (previous && previous !== objectPath) {
    await supabase.storage.from(BRANDING_BUCKET).remove([previous]);
  }

  await audit(
    supabase,
    organizationId,
    previous ? "clinic.logo_replaced" : "clinic.logo_uploaded",
    clinicId,
  );
  revalidateBooking(clinicId);
  return {};
}

export async function removeClinicLogoAction(clinicId: string): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("clinic.update", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("logo_url")
    .eq("id", clinicId)
    .maybeSingle();

  const { error } = await supabase.from("clinics").update({ logo_url: null }).eq("id", clinicId);
  if (error) return { error: error.message };

  const objectPath = objectPathFromPublicUrl(clinic?.logo_url ?? null);
  if (objectPath) {
    await supabase.storage.from(BRANDING_BUCKET).remove([objectPath]);
  }

  await audit(supabase, organizationId, "clinic.logo_removed", clinicId);
  revalidateBooking(clinicId);
  return {};
}

/**
 * Recovers the storage object key from a public URL, or null if the URL is not
 * one of ours. Deleting is driven by this rather than by string surgery at the
 * call site so a hand-edited logo_url can never turn into a delete against an
 * unrelated object.
 */
function objectPathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BRANDING_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

// ---------------------------------------------------------------------------
// Booking settings and operating hours
// ---------------------------------------------------------------------------

export async function saveBookingSettingsAction(
  clinicId: string,
  input: BookingSettingsInput,
): Promise<ActionResult> {
  const parsed = bookingSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the settings and try again." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("booking.manage", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const d = parsed.data;

  const row = {
    online_booking_enabled: d.onlineBookingEnabled,
    min_notice_hours: d.minNoticeHours,
    max_advance_days: d.maxAdvanceDays,
    slot_interval_minutes: d.slotIntervalMinutes,
    confirmation_mode: d.confirmationMode,
    allow_any_practitioner: d.allowAnyPractitioner,
    allow_cancellation: d.allowCancellation,
    allow_rescheduling: d.allowRescheduling,
    manage_cutoff_hours: d.manageCutoffHours,
    show_address: d.showAddress,
    show_phone: d.showPhone,
    show_email: d.showEmail,
    show_business_hours: d.showBusinessHours,
    primary_color: d.primaryColor ?? null,
    welcome_message: d.welcomeMessage ?? null,
  };

  // The settings row is created on first save rather than at clinic creation:
  // the table's defaults ARE the intended defaults, so a missing row and a
  // default row mean the same thing, and not creating one avoids a backfill
  // migration for every clinic that will never use online booking.
  const { data: existing } = await supabase
    .from("clinic_booking_settings")
    .select("id")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("clinic_booking_settings").update(row).eq("id", existing.id)
    : await supabase
        .from("clinic_booking_settings")
        .insert({ ...row, organization_id: organizationId, clinic_id: clinicId });

  if (error) return { error: error.message };

  await audit(supabase, organizationId, "booking.settings_updated", clinicId, {
    online_booking_enabled: d.onlineBookingEnabled,
  });
  revalidateBooking(clinicId);
  return {};
}

/**
 * Toggles online booking without opening the full settings form, for the
 * dashboard's per-clinic switch. Creates the settings row on first use, same
 * as saveBookingSettingsAction.
 */
export async function toggleOnlineBookingAction(
  clinicId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("booking.manage", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("clinic_booking_settings")
    .select("id")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("clinic_booking_settings")
        .update({ online_booking_enabled: enabled })
        .eq("id", existing.id)
    : await supabase.from("clinic_booking_settings").insert({
        organization_id: organizationId,
        clinic_id: clinicId,
        online_booking_enabled: enabled,
      });

  if (error) return { error: error.message };

  await audit(supabase, organizationId, enabled ? "booking.enabled" : "booking.disabled", clinicId);
  revalidateBooking(clinicId);
  return {};
}

/**
 * Writes clinics.operating_hours -- the column migration 0001 created and
 * nothing has ever populated, because the clinic form never offered it. The
 * availability engine reads it directly, so this is the editor for the real
 * source of truth, not a booking-specific copy of the clinic's hours.
 */
export async function saveOperatingHoursAction(
  clinicId: string,
  hours: OperatingHours,
): Promise<ActionResult> {
  const parsed = operatingHoursSchema.safeParse(hours);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue ? `${issue.path.join(" ")}: ${issue.message}` : "Check the opening hours.",
    };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("clinic.update", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("clinics")
    .update({ operating_hours: parsed.data })
    .eq("id", clinicId);

  if (error) return { error: error.message };

  await audit(supabase, organizationId, "clinic.operating_hours_updated", clinicId);
  revalidateBooking(clinicId);
  return {};
}

// ---------------------------------------------------------------------------
// Public services and practitioners
// ---------------------------------------------------------------------------

export async function savePublicServiceAction(
  clinicId: string,
  input: PublicServiceInput,
): Promise<ActionResult> {
  const parsed = publicServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the service details." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("booking.manage", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("services")
    .update({
      online_booking_enabled: parsed.data.onlineBookingEnabled,
      public_name: parsed.data.publicName ?? null,
      public_description: parsed.data.publicDescription ?? null,
    })
    .eq("id", parsed.data.serviceId)
    .eq("clinic_id", clinicId);

  if (error) return { error: error.message };

  await audit(supabase, organizationId, "booking.public_service_updated", clinicId, {
    service_id: parsed.data.serviceId,
    published: parsed.data.onlineBookingEnabled,
  });
  revalidateBooking(clinicId);
  return {};
}

export async function savePublicPractitionerAction(
  clinicId: string,
  input: PublicPractitionerInput,
): Promise<ActionResult> {
  const parsed = publicPractitionerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the practitioner details." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("booking.manage", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const d = parsed.data;

  const { data: existing } = await supabase
    .from("clinic_booking_practitioners")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", d.userId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("clinic_booking_practitioners")
        .update({
          active: d.active,
          display_name: d.displayName ?? null,
          title: d.title ?? null,
          bio: d.bio ?? null,
        })
        .eq("id", existing.id)
    : await supabase.from("clinic_booking_practitioners").insert({
        organization_id: organizationId,
        clinic_id: clinicId,
        user_id: d.userId,
        active: d.active,
        display_name: d.displayName ?? null,
        title: d.title ?? null,
        bio: d.bio ?? null,
      });

  if (error) return { error: error.message };

  await audit(supabase, organizationId, "booking.public_practitioner_updated", clinicId, {
    user_id: d.userId,
    published: d.active,
  });
  revalidateBooking(clinicId);
  return {};
}

// ---------------------------------------------------------------------------
// Booking links
// ---------------------------------------------------------------------------

export async function createBookingLinkAction(
  clinicId: string,
  input: BookingLinkInput,
): Promise<ActionResult> {
  const parsed = bookingLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the link details." };
  }

  const organizationId = await currentOrganizationId();
  const { userId } = await requirePermission("booking.manage", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("booking_links").insert({
    organization_id: organizationId,
    clinic_id: clinicId,
    name: parsed.data.name,
    token: generateLinkToken(),
    default_service_id: parsed.data.defaultServiceId ?? null,
    default_practitioner_id: parsed.data.defaultPractitionerId ?? null,
    utm_source: parsed.data.utmSource ?? null,
    utm_medium: parsed.data.utmMedium ?? null,
    utm_campaign: parsed.data.utmCampaign ?? null,
    created_by: userId,
  });

  if (error) return { error: error.message };

  await audit(supabase, organizationId, "booking.link_created", clinicId, {
    name: parsed.data.name,
  });
  revalidateBooking(clinicId);
  return {};
}

export async function setBookingLinkActiveAction(
  clinicId: string,
  linkId: string,
  active: boolean,
): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("booking.manage", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  // Deactivated, never deleted -- appointments attributed to this link keep a
  // resolvable source (migration 0019).
  const { error } = await supabase
    .from("booking_links")
    .update({ active })
    .eq("id", linkId)
    .eq("clinic_id", clinicId);

  if (error) return { error: error.message };

  await audit(
    supabase,
    organizationId,
    active ? "booking.link_activated" : "booking.link_deactivated",
    clinicId,
    { link_id: linkId },
  );
  revalidateBooking(clinicId);
  return {};
}
