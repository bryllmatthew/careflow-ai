"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError, UnauthenticatedError } from "@/lib/auth/errors";
import { clinicFormSchema, type ClinicFormInput } from "@/lib/validation/clinic.schema";

/**
 * Every action resolves the caller's current organization the same way the
 * (app) shell does (first active membership -- MVP has no org switcher, see
 * CLAUDE.md), then calls requirePermission() before touching the database.
 * This is defense-in-depth: RLS enforces the same clinic.* permission
 * independently, so a bug here fails closed, not open.
 */
async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

export async function createClinicAction(
  input: ClinicFormInput,
): Promise<{ error: string } | { error?: undefined }> {
  const parsed = clinicFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("clinic.create", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("clinics").insert({
    organization_id: organizationId,
    name: parsed.data.name,
    address: parsed.data.address ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    timezone: parsed.data.timezone,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clinics");
  return {};
}

export async function updateClinicAction(
  clinicId: string,
  input: ClinicFormInput,
): Promise<{ error: string } | { error?: undefined }> {
  const parsed = clinicFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("clinic.update", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      timezone: parsed.data.timezone,
    })
    .eq("id", clinicId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clinics");
  return {};
}

export async function setClinicStatusAction(clinicId: string, status: "active" | "inactive") {
  const organizationId = await currentOrganizationId();
  await requirePermission("clinic.update", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("clinics").update({ status }).eq("id", clinicId);
  if (error) throw new Error(error.message);

  revalidatePath("/clinics");
}

/**
 * Soft delete: sets deleted_at rather than removing the row (CLAUDE.md
 * "Database conventions"). The clinics list query filters deleted_at is null
 * itself -- deleted_at deliberately stays out of the RLS policy, so this is
 * an application-layer filter, not a security boundary.
 */
export async function deleteClinicAction(clinicId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("clinic.delete", { organizationId, clinicId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinics")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", clinicId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Clinic not found.");

  revalidatePath("/clinics");
}
