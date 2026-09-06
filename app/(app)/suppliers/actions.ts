"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { supplierFormSchema, type SupplierFormInput } from "@/lib/validation/supplier.schema";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

type CreateSupplierResult =
  { success: true; supplierId: string } | { success: false; error: string };
type ActionResult = { error: string } | { error?: undefined };

export async function createSupplierAction(
  input: SupplierFormInput,
): Promise<CreateSupplierResult> {
  const parsed = supplierFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("suppliers.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      contact_person: parsed.data.contactPerson ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/suppliers");
  return { success: true, supplierId: data.id };
}

export async function updateSupplierAction(
  supplierId: string,
  input: SupplierFormInput,
): Promise<ActionResult> {
  const parsed = supplierFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("suppliers.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      contact_person: parsed.data.contactPerson ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", supplierId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Supplier not found, or you don't have access to it." };

  revalidatePath("/suppliers");
  return {};
}

export async function setSupplierStatusAction(
  supplierId: string,
  status: "active" | "inactive",
): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("suppliers.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update({ status })
    .eq("id", supplierId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Supplier not found, or you don't have access to it." };

  revalidatePath("/suppliers");
  return {};
}
