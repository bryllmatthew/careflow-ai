"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError, UnauthenticatedError } from "@/lib/auth/errors";
import { patientFormSchema, type PatientFormInput } from "@/lib/validation/patient.schema";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

export type DuplicateMatch = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
};

type DuplicateRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
};

/**
 * Phone/email/name matching within the organization -- a patient shown at
 * one clinic could plausibly already be registered at another, so this
 * intentionally is not clinic-scoped the way the create/update RLS is.
 *
 * Three separate queries, merged and deduped here, rather than one
 * PostgREST `.or(...)` filter string: `.or()` takes a raw filter expression
 * and does not escape interpolated values the way `.eq()`/`.ilike()` do, so
 * a name or email containing a comma or parenthesis -- both meaningful in
 * PostgREST's filter syntax -- could silently produce the wrong filter
 * instead of a clean error. Three parameterized queries avoid that
 * entirely. Duplicate-check volume is low and not latency-sensitive, so the
 * extra round trips cost nothing that matters.
 */
async function findPotentialDuplicates(
  organizationId: string,
  input: PatientFormInput,
): Promise<DuplicateMatch[]> {
  const supabase = await getSupabaseServerClient();
  const base = () =>
    supabase
      .from("patients")
      .select("id, first_name, last_name, phone, email")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .limit(5);

  const queries = [base().ilike("first_name", input.firstName).ilike("last_name", input.lastName)];
  if (input.phone) queries.push(base().eq("phone", input.phone));
  if (input.email) queries.push(base().ilike("email", input.email));

  const results: { data: DuplicateRow[] | null }[] = await Promise.all(queries);
  const byId = new Map<string, DuplicateMatch>();
  for (const { data } of results) {
    for (const p of data ?? []) {
      byId.set(p.id, {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        phone: p.phone,
        email: p.email,
      });
    }
  }
  return Array.from(byId.values()).slice(0, 5);
}

export async function createPatientAction(
  input: PatientFormInput,
  options?: { confirmedDuplicates?: boolean },
): Promise<
  | { error: string; duplicates?: undefined }
  | { error?: undefined; duplicates: DuplicateMatch[] }
  | { error?: undefined; duplicates?: undefined }
> {
  const parsed = patientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("patients.create", { organizationId, clinicId: parsed.data.clinicId });

  if (!options?.confirmedDuplicates) {
    const duplicates = await findPotentialDuplicates(organizationId, parsed.data);
    if (duplicates.length > 0) {
      return { duplicates };
    }
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("patients").insert({
    organization_id: organizationId,
    clinic_id: parsed.data.clinicId,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    date_of_birth: parsed.data.dateOfBirth ?? null,
    gender: parsed.data.gender ?? null,
    address: parsed.data.address ?? null,
    notes: parsed.data.notes ?? null,
    assigned_staff_id: parsed.data.assignedStaffId ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/patients");
  return {};
}

export async function updatePatientAction(
  patientId: string,
  input: PatientFormInput,
): Promise<{ error: string } | { error?: undefined }> {
  const parsed = patientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("patients.update", { organizationId, clinicId: parsed.data.clinicId });

  const supabase = await getSupabaseServerClient();
  // .select().maybeSingle() rather than a bare update: PostgreSQL requires a
  // row to be SELECT-visible before UPDATE can locate it, independent of
  // whether the caller holds patients.update -- see migration 0011's comment
  // on patients_update. A practitioner with patients.update but no view of
  // this specific patient (not assigned to them, no broader patients.view)
  // would otherwise get a silent, misleading "success".
  const { data, error } = await supabase
    .from("patients")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      date_of_birth: parsed.data.dateOfBirth ?? null,
      gender: parsed.data.gender ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
      assigned_staff_id: parsed.data.assignedStaffId ?? null,
    })
    .eq("id", patientId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Patient not found, or you don't have access to it." };
  }

  revalidatePath("/patients");
  revalidatePath(`/patients/${patientId}`);
  return {};
}

/**
 * active <-> inactive is an ordinary edit (patients.update). Archiving --
 * either direction -- is the soft-delete boundary and requires patients.delete,
 * checked here in the application layer; the underlying UPDATE statement
 * itself only needs patients.update at the RLS layer (same split as clinics'
 * deleteClinicAction, documented in migration 0011).
 */
export async function setPatientStatusAction(
  patientId: string,
  status: "active" | "inactive" | "archived",
  currentStatus: string,
) {
  const organizationId = await currentOrganizationId();
  const requiresDelete = status === "archived" || currentStatus === "archived";
  await requirePermission(requiresDelete ? "patients.delete" : "patients.update", {
    organizationId,
  });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .update({ status })
    .eq("id", patientId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Patient not found, or you don't have access to it.");

  revalidatePath("/patients");
  revalidatePath(`/patients/${patientId}`);
}
