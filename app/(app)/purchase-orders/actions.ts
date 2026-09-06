"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError, NotFoundError } from "@/lib/auth/errors";
import {
  createPurchaseOrderSchema,
  purchaseOrderItemSchema,
  receivePurchaseOrderItemSchema,
  type CreatePurchaseOrderInput,
  type PurchaseOrderItemInput,
  type ReceivePurchaseOrderItemInput,
} from "@/lib/validation/purchase-order.schema";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

type ActionResult = { error: string } | { error?: undefined };
/** See app/(app)/invoices/actions.ts for why this is a literal discriminant. */
type CreatePOResult =
  { success: true; purchaseOrderId: string } | { success: false; error: string };

function friendlyRpcError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "23514":
      return error.message;
    case "42501":
      return "You don't have permission to do that.";
    default:
      return error.message;
  }
}

export async function createPurchaseOrderAction(
  input: CreatePurchaseOrderInput,
): Promise<CreatePOResult> {
  const parsed = createPurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("purchase_orders.manage", {
    organizationId,
    clinicId: parsed.data.clinicId,
  });

  const supabase = await getSupabaseServerClient();
  const auth = await getAuthContext();
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: organizationId,
      clinic_id: parsed.data.clinicId,
      supplier_id: parsed.data.supplierId,
      expected_date: parsed.data.expectedDate || null,
      notes: parsed.data.notes ?? null,
      created_by: auth?.userId ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/purchase-orders");
  return { success: true, purchaseOrderId: data.id };
}

export async function addPurchaseOrderItemAction(
  purchaseOrderId: string,
  input: PurchaseOrderItemInput,
): Promise<ActionResult> {
  const parsed = purchaseOrderItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await getSupabaseServerClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("clinic_id")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (!po) return { error: "Purchase order not found, or you don't have access to it." };

  const organizationId = await currentOrganizationId();
  await requirePermission("purchase_orders.manage", { organizationId, clinicId: po.clinic_id });

  const { error } = await supabase.from("purchase_order_items").insert({
    purchase_order_id: purchaseOrderId,
    organization_id: organizationId,
    clinic_id: po.clinic_id,
    product_id: parsed.data.productId,
    description: parsed.data.description,
    quantity_ordered: Number(parsed.data.quantityOrdered),
    unit_cost: Number(parsed.data.unitCost),
  });

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "This purchase order can no longer be edited (it's not a draft)."
          : error.message,
    };
  }

  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  return {};
}

export async function removePurchaseOrderItemAction(
  itemId: string,
  purchaseOrderId: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data)
    throw new NotFoundError(
      "This line can no longer be removed (the purchase order is not a draft).",
    );

  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
}

/** draft -> ordered. Assigns the purchase_order_number (app.assign_purchase_order_number trigger). */
export async function orderPurchaseOrderAction(purchaseOrderId: string): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("purchase_orders.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data: current } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (!current) return { error: "Purchase order not found, or you don't have access to it." };
  if (current.status !== "draft") return { error: "Only a draft purchase order can be ordered." };

  const { count } = await supabase
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", purchaseOrderId);
  if (!count) return { error: "Add at least one item before ordering." };

  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: "ordered" })
    .eq("id", purchaseOrderId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Purchase order not found, or you don't have access to it." };

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  return {};
}

export async function cancelPurchaseOrderAction(purchaseOrderId: string): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("purchase_orders.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data: current } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (!current) return { error: "Purchase order not found, or you don't have access to it." };
  if (!["draft", "ordered", "partially_received"].includes(current.status)) {
    return { error: "This purchase order can no longer be cancelled." };
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", purchaseOrderId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Purchase order not found, or you don't have access to it." };

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  return {};
}

type ReceiveResult = { success: true; movementId: string } | { success: false; error: string };

export async function receivePurchaseOrderItemAction(
  itemId: string,
  purchaseOrderId: string,
  input: ReceivePurchaseOrderItemInput,
): Promise<ReceiveResult> {
  const parsed = receivePurchaseOrderItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await currentOrganizationId();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("receive_purchase_order_item", {
    p_item_id: itemId,
    p_quantity: Number(parsed.data.quantity),
    p_batch_number: parsed.data.batchNumber,
    p_lot_number: parsed.data.lotNumber,
    p_expiration_date: parsed.data.expirationDate,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, error: friendlyRpcError(error) };

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  revalidatePath("/inventory");
  return { success: true, movementId: data };
}
