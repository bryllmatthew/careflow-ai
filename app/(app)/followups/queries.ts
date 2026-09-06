import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  FollowUpStatus,
  FollowUpType,
  FollowUpPriority,
} from "@/lib/validation/followup.schema";

export const FOLLOWUPS_PAGE_SIZE = 20;

const FOLLOWUP_SELECT =
  "id, type, status, priority, due_at, notes, completed_at, created_at, clinic_id, clinics(name), " +
  "patient_id, patients(first_name, last_name), " +
  "appointment_id, assigned_to, assigned:profiles!follow_ups_assigned_to_fkey(full_name, email)";

export type FollowUpRow = {
  id: string;
  type: string;
  status: string;
  priority: string;
  dueAt: string;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  clinicId: string;
  clinicName: string | null;
  patientId: string;
  patientName: string;
  appointmentId: string | null;
  assignedTo: string | null;
  assignedName: string | null;
};

type RawFollowUp = {
  id: string;
  type: string;
  status: string;
  priority: string;
  due_at: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  clinic_id: string;
  clinics: { name: string } | null;
  patient_id: string;
  patients: { first_name: string; last_name: string } | null;
  appointment_id: string | null;
  assigned_to: string | null;
  assigned: { full_name: string | null; email: string | null } | null;
};

function mapFollowUp(f: RawFollowUp): FollowUpRow {
  return {
    id: f.id,
    type: f.type,
    status: f.status,
    priority: f.priority,
    dueAt: f.due_at,
    notes: f.notes,
    completedAt: f.completed_at,
    createdAt: f.created_at,
    clinicId: f.clinic_id,
    clinicName: f.clinics?.name ?? null,
    patientId: f.patient_id,
    patientName: f.patients ? `${f.patients.first_name} ${f.patients.last_name}` : "Unknown",
    appointmentId: f.appointment_id,
    assignedTo: f.assigned_to,
    assignedName: f.assigned?.full_name ?? f.assigned?.email ?? null,
  };
}

export type FollowUpListFilters = {
  clinicId?: string;
  assignedTo?: string;
  status?: FollowUpStatus | "all";
  type?: FollowUpType | "all";
  priority?: FollowUpPriority | "all";
  /** "overdue" | "today" | "upcoming" | "completed" -- the dashboard-style buckets. */
  bucket?: "overdue" | "today" | "upcoming" | "completed" | "all";
  page?: number;
};

export async function listFollowUps(
  organizationId: string,
  filters: FollowUpListFilters,
): Promise<{ rows: FollowUpRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * FOLLOWUPS_PAGE_SIZE;
  const to = from + FOLLOWUPS_PAGE_SIZE - 1;

  let query = supabase
    .from("follow_ups")
    .select(FOLLOWUP_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.type && filters.type !== "all") query = query.eq("type", filters.type);
  if (filters.priority && filters.priority !== "all")
    query = query.eq("priority", filters.priority);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfTomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).toISOString();

  if (filters.bucket === "overdue") {
    query = query.lt("due_at", now.toISOString()).in("status", ["pending", "in_progress"]);
  } else if (filters.bucket === "today") {
    query = query
      .gte("due_at", startOfToday)
      .lt("due_at", startOfTomorrow)
      .in("status", ["pending", "in_progress"]);
  } else if (filters.bucket === "upcoming") {
    query = query.gte("due_at", startOfTomorrow).in("status", ["pending", "in_progress"]);
  } else if (filters.bucket === "completed") {
    query = query.eq("status", "completed");
  }

  const { data, count } = await query.order("due_at", { ascending: true }).range(from, to);

  return {
    rows: (data ?? []).map((f) => mapFollowUp(f as unknown as RawFollowUp)),
    total: count ?? 0,
  };
}

export async function getFollowUpById(followUpId: string): Promise<FollowUpRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("follow_ups")
    .select(FOLLOWUP_SELECT)
    .eq("id", followUpId)
    .maybeSingle();

  return data ? mapFollowUp(data as unknown as RawFollowUp) : null;
}

/** For the patient profile's Follow-Ups tab. */
export async function listPatientFollowUps(patientId: string): Promise<FollowUpRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("follow_ups")
    .select(FOLLOWUP_SELECT)
    .eq("patient_id", patientId)
    .order("due_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((f) => mapFollowUp(f as unknown as RawFollowUp));
}

export async function getFollowUpCounts(
  organizationId: string,
): Promise<{ overdue: number; dueToday: number; completedLast7Days: number }> {
  const supabase = await getSupabaseServerClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [overdueRes, todayRes, completedRes] = await Promise.all([
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .lt("due_at", now.toISOString())
      .in("status", ["pending", "in_progress"]),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("due_at", startOfToday.toISOString())
      .lt("due_at", startOfTomorrow.toISOString())
      .in("status", ["pending", "in_progress"]),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgo.toISOString()),
  ]);

  return {
    overdue: overdueRes.count ?? 0,
    dueToday: todayRes.count ?? 0,
    completedLast7Days: completedRes.count ?? 0,
  };
}

/** For the appointment detail sheet (docs/PRODUCT_SPEC.md Phase 4 section 17). */
export async function listFollowUpsForAppointment(appointmentId: string): Promise<FollowUpRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("follow_ups")
    .select(FOLLOWUP_SELECT)
    .eq("appointment_id", appointmentId)
    .order("due_at");

  return (data ?? []).map((f) => mapFollowUp(f as unknown as RawFollowUp));
}
