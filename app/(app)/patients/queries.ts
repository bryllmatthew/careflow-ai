import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PatientStatus } from "@/lib/validation/patient.schema";

/**
 * All patient data access lives here, not in page components (CLAUDE.md /
 * "keep database access separate from UI components"). Every query below
 * goes through the same RLS-carrying server client as everything else in
 * this app -- tenant and clinic scoping is enforced by the database, not by
 * anything in this file; these functions only shape the query and the
 * result, never widen what a caller is authorized to see.
 */

export const PATIENTS_PAGE_SIZE = 20;

export type PatientListFilters = {
  q?: string;
  clinicId?: string;
  status?: PatientStatus | "all";
  practitionerId?: string;
  page?: number;
};

export type PatientListRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  status: string;
  clinicName: string | null;
  assignedPractitionerName: string | null;
};

/**
 * Server-side search, filter and pagination -- never fetches the whole
 * table to filter in the browser. The `q` search rides the trigram index on
 * patients.search_text (migration 0011), so it stays fast as the table
 * grows rather than degrading into a sequential scan.
 */
export async function listPatients(
  organizationId: string,
  filters: PatientListFilters,
): Promise<{ rows: PatientListRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PATIENTS_PAGE_SIZE;
  const to = from + PATIENTS_PAGE_SIZE - 1;

  let query = supabase
    .from("patients")
    .select(
      "id, first_name, last_name, phone, email, status, clinics(name), assigned:profiles!patients_assigned_staff_id_fkey(full_name, email)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  } else if (!filters.status) {
    // Default view excludes archived patients, matching the clinics list's
    // deleted_at is null default -- archived is this table's soft-delete.
    query = query.neq("status", "archived");
  }

  if (filters.clinicId) {
    query = query.eq("clinic_id", filters.clinicId);
  }
  if (filters.practitionerId) {
    query = query.eq("assigned_staff_id", filters.practitionerId);
  }
  if (filters.q && filters.q.trim()) {
    query = query.ilike("search_text", `%${filters.q.trim().toLowerCase()}%`);
  }

  const { data, count } = await query
    .order("last_name")
    .order("first_name")
    .range(from, to);

  const rows: PatientListRow[] = (data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    phone: p.phone,
    email: p.email,
    status: p.status,
    clinicName: p.clinics?.name ?? null,
    assignedPractitionerName: p.assigned?.full_name ?? p.assigned?.email ?? null,
  }));

  return { rows, total: count ?? 0 };
}

export type PatientDetail = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  clinicId: string;
  clinicName: string | null;
  assignedStaffId: string | null;
  assignedPractitionerName: string | null;
  createdAt: string;
};

export async function getPatientById(patientId: string): Promise<PatientDetail | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select(
      "id, first_name, last_name, phone, email, date_of_birth, gender, address, notes, status, clinic_id, assigned_staff_id, created_at, clinics(name), assigned:profiles!patients_assigned_staff_id_fkey(full_name, email)",
    )
    .eq("id", patientId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    phone: data.phone,
    email: data.email,
    dateOfBirth: data.date_of_birth,
    gender: data.gender,
    address: data.address,
    notes: data.notes,
    status: data.status,
    clinicId: data.clinic_id,
    clinicName: data.clinics?.name ?? null,
    assignedStaffId: data.assigned_staff_id,
    assignedPractitionerName: data.assigned?.full_name ?? data.assigned?.email ?? null,
    createdAt: data.created_at,
  };
}

export async function listClinicOptions(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("clinics")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name");
  return data ?? [];
}

/**
 * Org members eligible to be an "assigned practitioner" -- every active
 * member, not filtered by role. There is no dedicated staff/practitioner
 * directory yet (Staff Management is its own future module -- see
 * lib/navigation.ts), so this is deliberately broad rather than guessing at
 * a role filter the permission model doesn't actually express.
 */
export async function listPractitionerOptions(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("organization_memberships")
    .select("user_id, profiles(full_name, email)")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  return (data ?? [])
    .map((m) => ({
      id: m.user_id,
      name: m.profiles?.full_name ?? m.profiles?.email ?? "Unknown",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reusable counts for the dashboard (Task 2's "Dashboard integration"
 * section) -- a real Dashboard module can call this directly rather than
 * duplicating the query.
 */
export async function getPatientCounts(
  organizationId: string,
): Promise<{ total: number; active: number; newLast30Days: number }> {
  const supabase = await getSupabaseServerClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [totalRes, activeRes, newRes] = await Promise.all([
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .gte("created_at", thirtyDaysAgo),
  ]);

  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    newLast30Days: newRes.count ?? 0,
  };
}
