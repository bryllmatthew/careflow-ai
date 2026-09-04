"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError, UnauthenticatedError } from "@/lib/auth/errors";
import { serviceFormSchema, type ServiceFormInput } from "@/lib/validation/service.schema";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

export async function createServiceAction(
  input: ServiceFormInput,
): Promise<{ error: string } | { error?: undefined }> {
  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("services.manage", { organizationId, clinicId: parsed.data.clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("services").insert({
    organization_id: organizationId,
    clinic_id: parsed.data.clinicId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    duration_minutes: parsed.data.durationMinutes,
    // Validated as a well-formed decimal string by the Zod schema; converted
    // to a number only here, at the write boundary, to match what
    // PostgREST's numeric(14,2) column actually accepts over the wire.
    price: Number(parsed.data.price),
    cost: parsed.data.cost === undefined ? null : Number(parsed.data.cost),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/services");
  return {};
}

export async function updateServiceAction(
  serviceId: string,
  input: ServiceFormInput,
): Promise<{ error: string } | { error?: undefined }> {
  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("services.manage", { organizationId, clinicId: parsed.data.clinicId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      duration_minutes: parsed.data.durationMinutes,
      price: Number(parsed.data.price),
      cost: parsed.data.cost === undefined ? null : Number(parsed.data.cost),
    })
    .eq("id", serviceId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Service not found, or you don't have access to it." };
  }

  revalidatePath("/services");
  return {};
}

export async function setServiceStatusAction(serviceId: string, status: "active" | "inactive") {
  const organizationId = await currentOrganizationId();
  await requirePermission("services.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .update({ status })
    .eq("id", serviceId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Service not found, or you don't have access to it.");

  revalidatePath("/services");
}

/**
 * Soft delete: sets deleted_at, same pattern as deleteClinicAction. A
 * service already used on an appointment/invoice stays intact for history --
 * this just removes it from the active catalogue.
 */
export async function deleteServiceAction(serviceId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("services.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", serviceId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Service not found.");

  revalidatePath("/services");
}
