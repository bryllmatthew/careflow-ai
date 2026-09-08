import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppointmentStatus } from "@/lib/validation/appointment.schema";

export const APPOINTMENTS_PAGE_SIZE = 20;

const APPOINTMENT_SELECT =
  "id, start_at, end_at, status, notes, clinic_id, clinics(name), " +
  "patient_id, patients(first_name, last_name), " +
  "staff_id, staff:profiles!appointments_staff_id_fkey(full_name, email), " +
  "service_id, services(name, duration_minutes, price), " +
  "booking_source, booking_reference";

export type AppointmentRow = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  notes: string | null;
  clinicId: string;
  clinicName: string | null;
  patientId: string;
  patientName: string;
  staffId: string;
  staffName: string | null;
  serviceId: string;
  serviceName: string | null;
  serviceDurationMinutes: number | null;
  servicePrice: string | null;
  /** admin | direct_booking | marketplace -- Phase 10 (migration 0019). */
  bookingSource: string;
  /** The patient-facing "CF-XXXXXX" reference, for bookings made online. */
  bookingReference: string | null;
};

type RawAppointment = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
  clinic_id: string;
  clinics: { name: string } | null;
  patient_id: string;
  patients: { first_name: string; last_name: string } | null;
  staff_id: string;
  staff: { full_name: string | null; email: string | null } | null;
  service_id: string;
  services: { name: string; duration_minutes: number; price: number } | null;
  booking_source: string;
  booking_reference: string | null;
};

function mapAppointment(a: RawAppointment): AppointmentRow {
  return {
    id: a.id,
    startAt: a.start_at,
    endAt: a.end_at,
    status: a.status,
    notes: a.notes,
    clinicId: a.clinic_id,
    clinicName: a.clinics?.name ?? null,
    patientId: a.patient_id,
    patientName: a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : "Unknown",
    staffId: a.staff_id,
    staffName: a.staff?.full_name ?? a.staff?.email ?? null,
    serviceId: a.service_id,
    serviceName: a.services?.name ?? null,
    serviceDurationMinutes: a.services?.duration_minutes ?? null,
    servicePrice: a.services ? a.services.price.toFixed(2) : null,
    bookingSource: a.booking_source,
    bookingReference: a.booking_reference,
  };
}

/** For the calendar's day/week grid -- every appointment overlapping [start, end). */
export async function listAppointmentsForRange(
  organizationId: string,
  range: { startISO: string; endISO: string; clinicId?: string; staffId?: string },
): Promise<AppointmentRow[]> {
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("organization_id", organizationId)
    .lt("start_at", range.endISO)
    .gt("end_at", range.startISO);

  if (range.clinicId) query = query.eq("clinic_id", range.clinicId);
  if (range.staffId) query = query.eq("staff_id", range.staffId);

  const { data } = await query.order("start_at");
  return (data ?? []).map((a) => mapAppointment(a as unknown as RawAppointment));
}

export type AppointmentListFilters = {
  clinicId?: string;
  staffId?: string;
  status?: AppointmentStatus | "all";
  patientId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
};

/** For the /appointments list page -- filtered, paginated, most recent first. */
export async function listAppointments(
  organizationId: string,
  filters: AppointmentListFilters,
): Promise<{ rows: AppointmentRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * APPOINTMENTS_PAGE_SIZE;
  const to = from + APPOINTMENTS_PAGE_SIZE - 1;

  let query = supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.staffId) query = query.eq("staff_id", filters.staffId);
  if (filters.patientId) query = query.eq("patient_id", filters.patientId);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.startDate) query = query.gte("start_at", filters.startDate);
  if (filters.endDate) query = query.lte("start_at", filters.endDate);

  const { data, count } = await query.order("start_at", { ascending: false }).range(from, to);

  return {
    rows: (data ?? []).map((a) => mapAppointment(a as unknown as RawAppointment)),
    total: count ?? 0,
  };
}

export async function getAppointmentById(appointmentId: string): Promise<AppointmentRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", appointmentId)
    .maybeSingle();

  return data ? mapAppointment(data as unknown as RawAppointment) : null;
}

/** For the patient profile's Appointments tab -- most recent first. */
export async function listPatientAppointments(patientId: string): Promise<AppointmentRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("patient_id", patientId)
    .order("start_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((a) => mapAppointment(a as unknown as RawAppointment));
}

/**
 * Lightweight patient search for the booking form's patient picker --
 * there's no cmdk/Combobox in this project yet (no dependency added for it),
 * so the picker is a plain debounced search-as-you-type list built from this
 * and a couple of primitives, not a full combobox component.
 */
export async function searchPatientsForBooking(
  organizationId: string,
  query: string,
): Promise<{ id: string; name: string; phone: string | null }[]> {
  if (!query.trim()) return [];
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .ilike("search_text", `%${query.trim().toLowerCase()}%`)
    .order("last_name")
    .limit(8);

  return (data ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    phone: p.phone,
  }));
}

/** Reusable counts for the dashboard, same pattern as patients/queries.ts's getPatientCounts(). */
export async function getAppointmentCounts(
  organizationId: string,
): Promise<{ today: number; next7Days: number }> {
  const supabase = await getSupabaseServerClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const in7Days = new Date(startOfToday);
  in7Days.setDate(in7Days.getDate() + 7);

  const excludedStatuses = ["cancelled", "no_show"];

  const [todayRes, next7Res] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .not("status", "in", `(${excludedStatuses.join(",")})`)
      .gte("start_at", startOfToday.toISOString())
      .lt("start_at", startOfTomorrow.toISOString()),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .not("status", "in", `(${excludedStatuses.join(",")})`)
      .gte("start_at", now.toISOString())
      .lt("start_at", in7Days.toISOString()),
  ]);

  return { today: todayRes.count ?? 0, next7Days: next7Res.count ?? 0 };
}

export type ReminderRow = {
  id: string;
  reminderType: string;
  channel: string;
  scheduledFor: string;
  sentAt: string | null;
  status: string;
  failureReason: string | null;
  retryCount: number;
};

/** For the appointment detail sheet (docs/PRODUCT_SPEC.md Phase 4 section 17). */
export async function listRemindersForAppointment(appointmentId: string): Promise<ReminderRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("reminders")
    .select(
      "id, reminder_type, channel, scheduled_for, sent_at, status, failure_reason, retry_count",
    )
    .eq("appointment_id", appointmentId)
    .order("scheduled_for");

  return (data ?? []).map((r) => ({
    id: r.id,
    reminderType: r.reminder_type,
    channel: r.channel,
    scheduledFor: r.scheduled_for,
    sentAt: r.sent_at,
    status: r.status,
    failureReason: r.failure_reason,
    retryCount: r.retry_count,
  }));
}

/** For the dashboard (docs/PRODUCT_SPEC.md Phase 4 section 25). */
export async function getReminderCounts(
  organizationId: string,
): Promise<{ scheduled: number; sentLast7Days: number; failed: number }> {
  const supabase = await getSupabaseServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [scheduledRes, sentRes, failedRes] = await Promise.all([
    supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "scheduled"),
    supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "sent")
      .gte("sent_at", sevenDaysAgo),
    supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "failed"),
  ]);

  return {
    scheduled: scheduledRes.count ?? 0,
    sentLast7Days: sentRes.count ?? 0,
    failed: failedRes.count ?? 0,
  };
}
