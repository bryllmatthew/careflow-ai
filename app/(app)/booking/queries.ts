import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OperatingHours } from "@/lib/validation/booking.schema";

/**
 * Clinic-side reads for the booking administration screens.
 *
 * Everything here goes through the normal RLS-respecting client, so a
 * clinic-scoped manager sees exactly their own clinics with no extra filtering
 * in this file -- the same property Phase 8's reporting relies on. There is no
 * `organization_id` predicate doing security work below; where one appears it
 * is narrowing a query, not enforcing a boundary.
 */

export type BookingClinicSummary = {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  timezone: string;
  status: string;
  onlineBookingEnabled: boolean;
  hasSettings: boolean;
  publicServiceCount: number;
  publicPractitionerCount: number;
  hasOperatingHours: boolean;
  bookingsToday: number;
  bookingsThisWeek: number;
};

export async function listBookingClinics(organizationId: string): Promise<BookingClinicSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data: clinics } = await supabase
    .from("clinics")
    .select("id, name, slug, logo_url, timezone, status, operating_hours")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name");

  if (!clinics?.length) return [];
  const clinicIds = clinics.map((c) => c.id);

  // Week starts Monday (ISO 8601) -- the same convention every Phase 8 date
  // range uses (CLAUDE.md, "Deliberate deviations").
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfToday.getDay() + 6) % 7));

  const [settingsRes, servicesRes, practitionersRes, todayRes, weekRes] = await Promise.all([
    supabase
      .from("clinic_booking_settings")
      .select("clinic_id, online_booking_enabled")
      .in("clinic_id", clinicIds),
    supabase
      .from("services")
      .select("clinic_id")
      .in("clinic_id", clinicIds)
      .eq("online_booking_enabled", true)
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("clinic_booking_practitioners")
      .select("clinic_id")
      .in("clinic_id", clinicIds)
      .eq("active", true),
    // "Bookings today" counts when the booking was MADE, not when the
    // appointment is -- it is an online-booking-volume metric for the clinic
    // dashboard, not a schedule view (which /calendar already is).
    supabase
      .from("appointments")
      .select("clinic_id")
      .in("clinic_id", clinicIds)
      .eq("booking_source", "direct_booking")
      .gte("created_at", startOfToday.toISOString())
      .lt("created_at", startOfTomorrow.toISOString()),
    supabase
      .from("appointments")
      .select("clinic_id")
      .in("clinic_id", clinicIds)
      .eq("booking_source", "direct_booking")
      .gte("created_at", startOfWeek.toISOString()),
  ]);

  const countBy = (rows: { clinic_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.clinic_id, (map.get(r.clinic_id) ?? 0) + 1);
    return map;
  };

  const settings = new Map(
    (settingsRes.data ?? []).map((s) => [s.clinic_id, s.online_booking_enabled]),
  );
  const services = countBy(servicesRes.data);
  const practitioners = countBy(practitionersRes.data);
  const today = countBy(todayRes.data);
  const week = countBy(weekRes.data);

  return clinics.map((c) => {
    const hours = (c.operating_hours ?? {}) as Record<string, unknown[]>;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      logoUrl: c.logo_url,
      timezone: c.timezone,
      status: c.status,
      onlineBookingEnabled: settings.get(c.id) ?? false,
      hasSettings: settings.has(c.id),
      publicServiceCount: services.get(c.id) ?? 0,
      publicPractitionerCount: practitioners.get(c.id) ?? 0,
      hasOperatingHours: Object.values(hours).some((v) => Array.isArray(v) && v.length > 0),
      bookingsToday: today.get(c.id) ?? 0,
      bookingsThisWeek: week.get(c.id) ?? 0,
    };
  });
}

export type BookingClinicDetail = {
  clinic: {
    id: string;
    name: string;
    slug: string | null;
    logoUrl: string | null;
    timezone: string;
    operatingHours: OperatingHours;
  };
  settings: {
    onlineBookingEnabled: boolean;
    minNoticeHours: number;
    maxAdvanceDays: number;
    slotIntervalMinutes: number;
    confirmationMode: "auto" | "manual";
    allowAnyPractitioner: boolean;
    allowCancellation: boolean;
    allowRescheduling: boolean;
    manageCutoffHours: number;
    showAddress: boolean;
    showPhone: boolean;
    showEmail: boolean;
    showBusinessHours: boolean;
    primaryColor: string | null;
    welcomeMessage: string | null;
  } | null;
  services: {
    id: string;
    name: string;
    durationMinutes: number;
    price: string;
    onlineBookingEnabled: boolean;
    publicName: string | null;
    publicDescription: string | null;
  }[];
  practitioners: {
    userId: string;
    name: string;
    published: boolean;
    active: boolean;
    displayName: string | null;
    title: string | null;
    bio: string | null;
  }[];
  links: {
    id: string;
    name: string;
    token: string;
    active: boolean;
    defaultServiceId: string | null;
    defaultPractitionerId: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    bookingCount: number;
  }[];
};

const EMPTY_HOURS: OperatingHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

export async function getBookingClinicDetail(
  organizationId: string,
  clinicId: string,
): Promise<BookingClinicDetail | null> {
  const supabase = await getSupabaseServerClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name, slug, logo_url, timezone, operating_hours")
    .eq("id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();

  // Null here means RLS filtered it out, which is the correct "not found" for
  // a clinic in another tenant -- there is no separate authorization branch.
  if (!clinic) return null;

  const [settingsRes, servicesRes, membersRes, publishedRes, linksRes, linkBookingsRes] =
    await Promise.all([
      supabase.from("clinic_booking_settings").select("*").eq("clinic_id", clinicId).maybeSingle(),
      supabase
        .from("services")
        .select(
          "id, name, duration_minutes, price, online_booking_enabled, public_name, public_description",
        )
        .eq("clinic_id", clinicId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("organization_memberships")
        .select("user_id, profiles(full_name, email)")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("clinic_booking_practitioners")
        .select("user_id, active, display_name, title, bio")
        .eq("clinic_id", clinicId),
      supabase
        .from("booking_links")
        .select(
          "id, name, token, active, default_service_id, default_practitioner_id, utm_source, utm_medium, utm_campaign",
        )
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("booking_link_id")
        .eq("clinic_id", clinicId)
        .not("booking_link_id", "is", null),
    ]);

  const published = new Map((publishedRes.data ?? []).map((p) => [p.user_id, p] as const));

  const linkCounts = new Map<string, number>();
  for (const row of linkBookingsRes.data ?? []) {
    if (row.booking_link_id) {
      linkCounts.set(row.booking_link_id, (linkCounts.get(row.booking_link_id) ?? 0) + 1);
    }
  }

  const s = settingsRes.data;

  return {
    clinic: {
      id: clinic.id,
      name: clinic.name,
      slug: clinic.slug,
      logoUrl: clinic.logo_url,
      timezone: clinic.timezone,
      operatingHours: { ...EMPTY_HOURS, ...((clinic.operating_hours ?? {}) as OperatingHours) },
    },
    settings: s
      ? {
          onlineBookingEnabled: s.online_booking_enabled,
          minNoticeHours: s.min_notice_hours,
          maxAdvanceDays: s.max_advance_days,
          slotIntervalMinutes: s.slot_interval_minutes,
          confirmationMode: s.confirmation_mode as "auto" | "manual",
          allowAnyPractitioner: s.allow_any_practitioner,
          allowCancellation: s.allow_cancellation,
          allowRescheduling: s.allow_rescheduling,
          manageCutoffHours: s.manage_cutoff_hours,
          showAddress: s.show_address,
          showPhone: s.show_phone,
          showEmail: s.show_email,
          showBusinessHours: s.show_business_hours,
          primaryColor: s.primary_color,
          welcomeMessage: s.welcome_message,
        }
      : null,
    services: (servicesRes.data ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      durationMinutes: v.duration_minutes,
      price: Number(v.price).toFixed(2),
      onlineBookingEnabled: v.online_booking_enabled,
      publicName: v.public_name,
      publicDescription: v.public_description,
    })),
    practitioners: (membersRes.data ?? [])
      .map((m) => {
        const pub = published.get(m.user_id);
        return {
          userId: m.user_id,
          name: m.profiles?.full_name ?? m.profiles?.email ?? "Unknown",
          published: Boolean(pub),
          active: pub?.active ?? false,
          displayName: pub?.display_name ?? null,
          title: pub?.title ?? null,
          bio: pub?.bio ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    links: (linksRes.data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      token: l.token,
      active: l.active,
      defaultServiceId: l.default_service_id,
      defaultPractitionerId: l.default_practitioner_id,
      utmSource: l.utm_source,
      utmMedium: l.utm_medium,
      utmCampaign: l.utm_campaign,
      bookingCount: linkCounts.get(l.id) ?? 0,
    })),
  };
}

/**
 * Online-booking metrics for the Phase 8 business report and the dashboard.
 *
 * Reads the same appointments table every other report reads, filtered by the
 * booking_source column migration 0019 added -- no separate analytics store,
 * no event pipeline (brief section 43: "do not create an isolated analytics
 * system").
 */
export type OnlineBookingMetrics = {
  total: number;
  online: number;
  onlineShare: number;
  byService: { name: string; count: number }[];
  byPractitioner: { name: string; count: number }[];
  bySource: { source: string; count: number }[];
  byCampaign: { campaign: string; count: number }[];
};

export async function getOnlineBookingMetrics(
  organizationId: string,
  range: { startISO: string; endISO: string; clinicId?: string },
): Promise<OnlineBookingMetrics> {
  const supabase = await getSupabaseServerClient();

  let query = supabase
    .from("appointments")
    .select(
      "booking_source, utm_source, utm_campaign, services(name), staff:profiles!appointments_staff_id_fkey(full_name, email)",
    )
    .eq("organization_id", organizationId)
    .gte("created_at", range.startISO)
    .lt("created_at", range.endISO);

  if (range.clinicId) query = query.eq("clinic_id", range.clinicId);

  const { data } = await query;
  const rows = data ?? [];

  // Aggregated in application code, matching Phase 8's own decision
  // (CLAUDE.md): PostgREST has no GROUP BY, and these row counts are small.
  const tally = (pairs: (string | null | undefined)[]) => {
    const map = new Map<string, number>();
    for (const key of pairs) {
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  const online = rows.filter((r) => r.booking_source !== "admin");

  return {
    total: rows.length,
    online: online.length,
    onlineShare: rows.length === 0 ? 0 : online.length / rows.length,
    byService: tally(online.map((r) => r.services?.name)).map(([name, count]) => ({
      name,
      count,
    })),
    byPractitioner: tally(online.map((r) => r.staff?.full_name ?? r.staff?.email)).map(
      ([name, count]) => ({ name, count }),
    ),
    bySource: tally(online.map((r) => r.utm_source ?? "direct")).map(([source, count]) => ({
      source,
      count,
    })),
    byCampaign: tally(online.map((r) => r.utm_campaign)).map(([campaign, count]) => ({
      campaign,
      count,
    })),
  };
}

/**
 * How many online bookings are sitting unconfirmed, for the badge on the
 * Appointments nav item.
 *
 * "Pending direct bookings" rather than "unread notifications" on purpose: it
 * is a count of work still to do, so it clears when the clinic actually
 * confirms the appointments rather than when someone glances at an inbox. A
 * clinic on `auto` confirmation mode therefore never sees a badge, which is
 * correct -- nothing is waiting on them.
 *
 * Deliberately unfiltered by clinic: RLS already limits the rows to clinics
 * the caller may see, so the badge counts exactly the bookings this user could
 * open (docs/modules/REPORTING.md's "aggregation security is a property of the
 * existing SELECT policies").
 */
export async function getPendingOnlineBookingCount(organizationId: string): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("booking_source", "direct_booking")
    .eq("status", "pending");

  return count ?? 0;
}
