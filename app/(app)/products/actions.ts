"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { productFormSchema, type ProductFormInput } from "@/lib/validation/product.schema";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

/** See app/(app)/invoices/actions.ts for why this is a literal discriminant. */
type CreateProductResult = { success: true; productId: string } | { success: false; error: string };
type ActionResult = { error: string } | { error?: undefined };

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return error.message.includes("barcode")
      ? "Another product already uses this barcode."
      : "Another product already uses this SKU.";
  }
  return error.message;
}

export async function createProductAction(input: ProductFormInput): Promise<CreateProductResult> {
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("products.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      sku: parsed.data.sku ?? null,
      barcode: parsed.data.barcode ?? null,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      brand: parsed.data.brand ?? null,
      unit_of_measure: parsed.data.unitOfMeasure,
      unit_cost: Number(parsed.data.unitCost),
      selling_price: parsed.data.sellingPrice ? Number(parsed.data.sellingPrice) : null,
      track_inventory: parsed.data.trackInventory,
      track_expiration: parsed.data.trackExpiration,
      reorder_level: Number(parsed.data.reorderLevel),
      reorder_quantity: Number(parsed.data.reorderQuantity),
      supplier_id: parsed.data.supplierId || null,
      supplier_sku: parsed.data.supplierSku ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: friendlyDbError(error) };

  revalidatePath("/products");
  return { success: true, productId: data.id };
}

export async function updateProductAction(
  productId: string,
  input: ProductFormInput,
): Promise<ActionResult> {
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("products.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      sku: parsed.data.sku ?? null,
      barcode: parsed.data.barcode ?? null,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      brand: parsed.data.brand ?? null,
      unit_of_measure: parsed.data.unitOfMeasure,
      unit_cost: Number(parsed.data.unitCost),
      selling_price: parsed.data.sellingPrice ? Number(parsed.data.sellingPrice) : null,
      track_inventory: parsed.data.trackInventory,
      track_expiration: parsed.data.trackExpiration,
      reorder_level: Number(parsed.data.reorderLevel),
      reorder_quantity: Number(parsed.data.reorderQuantity),
      supplier_id: parsed.data.supplierId || null,
      supplier_sku: parsed.data.supplierSku ?? null,
    })
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (error) return { error: friendlyDbError(error) };
  if (!data) return { error: "Product not found, or you don't have access to it." };

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return {};
}

/** Products with historical transactions are deactivated, never deleted (section 48). */
export async function setProductStatusAction(
  productId: string,
  status: "active" | "inactive",
): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("products.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status })
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Product not found, or you don't have access to it." };

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return {};
}
