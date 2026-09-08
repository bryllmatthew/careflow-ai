import "server-only";

import { getPublicBookingClient, getClientRateKey } from "./public-client";

/**
 * Typed reads over the public booking RPCs (migration 0020). Each RPC returns
 * a single jsonb document, so these functions are the one place that shape is
 * narrowed -- nothing downstream indexes into raw `Json`.
 *
 * The casts here are deliberate and load-bearing to keep honest: the generated
 * types say `Json` because Postgres says `jsonb`, and the actual shape is
 * defined by the RPC bodies in migration 0020. Changing one without the other
 * is the failure mode, which is why the RPC and these types are described
 * together in docs/modules/ONLINE_BOOKING.md.
 */

export type PublicClinic = {
  name: string;
  slug: string;
  logoUrl?: string;
  timezone: string;
  address?: string;
  phone?: string;
  email?: string;
  businessHours?: Record<string, { open: string; close: string }[]>;
};

export type PublicBookingSettings = {
  allowAnyPractitioner: boolean;
  allowCancellation: boolean;
  allowRescheduling: boolean;
  minNoticeHours: number;
  maxAdvanceDays: number;
  confirmationMode: "auto" | "manual";
  primaryColor: string | null;
  welcomeMessage: string | null;
};

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  /** Money crosses the wire as a string, never a JS number (CLAUDE.md). */
  price: string;
};

export type PublicPractitioner = {
  id: string;
  name: string;
  title?: string;
  bio?: string;
};

export type PublicBookingPage = {
  clinic: PublicClinic;
  settings: PublicBookingSettings;
  services: PublicService[];
  practitioners: PublicPractitioner[];
  link: { name: string; defaultServiceId?: string; defaultPractitionerId?: string } | null;
};

/**
 * Returns null for an unknown slug, a soft-deleted or inactive clinic, and a
 * clinic that has not switched online booking on. Those are one state on
 * purpose: distinguishing them would tell a stranger which clinic names exist
 * in CareFlow (brief section 33).
 */
export async function getPublicBookingPage(
  slug: string,
  linkToken?: string,
): Promise<PublicBookingPage | null> {
  const supabase = getPublicBookingClient();
  const { data, error } = await supabase.rpc("get_public_booking_page", {
    p_slug: slug,
    p_link_token: linkToken ?? undefined,
  });
  if (error || !data) return null;
  return data as unknown as PublicBookingPage;
}

export type AvailabilityDay = {
  date: string;
  slots: { startAt: string; staffIds: string[] }[];
};

export type AvailabilityResult =
  { ok: true; days: AvailabilityDay[] } | { ok: false; error: string };

export async function getPublicAvailability(params: {
  slug: string;
  serviceId: string;
  staffId?: string;
  from?: string;
  days?: number;
}): Promise<AvailabilityResult> {
  const supabase = getPublicBookingClient();
  const { data, error } = await supabase.rpc("get_public_booking_availability", {
    p_slug: params.slug,
    p_service_id: params.serviceId,
    p_staff_id: params.staffId ?? undefined,
    p_from: params.from ?? undefined,
    p_days: params.days ?? 14,
    p_client_key: (await getClientRateKey()) ?? undefined,
  });

  if (error) return { ok: false, error: "unavailable" };

  const payload = data as unknown as { days?: AvailabilityDay[]; error?: string } | null;
  if (!payload) return { ok: false, error: "unavailable" };
  if (payload.error) return { ok: false, error: payload.error };
  return { ok: true, days: payload.days ?? [] };
}

export type ManagedBooking = {
  reference: string;
  status: string;
  startAt: string;
  endAt: string;
  clinic: PublicClinic;
  service: { id: string; name: string; durationMinutes: number };
  practitioner: string;
  canCancel: boolean;
  canReschedule: boolean;
};

/**
 * Looks a booking up by its manage token. The token is the credential -- the
 * appointment id opens nothing -- and it is compared against a stored SHA-256
 * inside the RPC, so this never has the plaintext of anything it can be
 * compared to.
 */
export async function getBookingByToken(token: string): Promise<ManagedBooking | null> {
  const supabase = getPublicBookingClient();
  const { data, error } = await supabase.rpc("get_public_booking", { p_token: token });
  if (error || !data) return null;
  return data as unknown as ManagedBooking;
}
