"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError } from "@/lib/auth/errors";
import {
  receiveStockSchema,
  adjustInventorySchema,
  transferInventorySchema,
  type ReceiveStockInput,
  type AdjustInventoryInput,
  type TransferInventoryInput,
} from "@/lib/validation/inventory.schema";
import { listClinicProductBatches, type InventoryBatchRow } from "./queries";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

type MovementResult = { success: true; movementId: string } | { success: false; error: string };

/** Maps the Postgres error codes the stock RPCs actually raise into user-facing text. */
function friendlyRpcError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "23514":
      return error.message;
    case "42501":
      return "You don't have permission to do that for this clinic.";
    case "02000":
      return "Not found, or you don't have access to it.";
    default:
      return error.message;
  }
}

export async function receiveStockAction(input: ReceiveStockInput): Promise<MovementResult> {
  const parsed = receiveStockSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("inventory.manage", { organizationId, clinicId: parsed.data.clinicId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("receive_stock", {
    p_clinic_id: parsed.data.clinicId,
    p_product_id: parsed.data.productId,
    p_quantity: Number(parsed.data.quantity),
    p_unit_cost: parsed.data.unitCost ? Number(parsed.data.unitCost) : undefined,
    p_batch_number: parsed.data.batchNumber,
    p_lot_number: parsed.data.lotNumber,
    p_expiration_date: parsed.data.expirationDate,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, error: friendlyRpcError(error) };

  revalidatePath("/inventory");
  revalidatePath(`/products/${parsed.data.productId}`);
  return { success: true, movementId: data };
}

export async function adjustInventoryAction(input: AdjustInventoryInput): Promise<MovementResult> {
  const parsed = adjustInventorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("inventory.manage", { organizationId, clinicId: parsed.data.clinicId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("adjust_inventory", {
    p_clinic_id: parsed.data.clinicId,
    p_product_id: parsed.data.productId,
    p_quantity_delta: Number(parsed.data.quantityDelta),
    p_movement_type: parsed.data.movementType,
    p_reason: parsed.data.reason,
    p_batch_id: parsed.data.batchId,
  });

  if (error) return { success: false, error: friendlyRpcError(error) };

  revalidatePath("/inventory");
  revalidatePath(`/products/${parsed.data.productId}`);
  return { success: true, movementId: data };
}

type TransferResult =
  { success: true; transferGroupId: string } | { success: false; error: string };

export async function transferInventoryAction(
  input: TransferInventoryInput,
): Promise<TransferResult> {
  const parsed = transferInventorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("inventory.manage", {
    organizationId,
    clinicId: parsed.data.fromClinicId,
  });
  await requirePermission("inventory.manage", { organizationId, clinicId: parsed.data.toClinicId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("transfer_inventory", {
    p_from_clinic_id: parsed.data.fromClinicId,
    p_to_clinic_id: parsed.data.toClinicId,
    p_product_id: parsed.data.productId,
    p_quantity: Number(parsed.data.quantity),
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, error: friendlyRpcError(error) };

  revalidatePath("/inventory");
  revalidatePath(`/products/${parsed.data.productId}`);
  return { success: true, transferGroupId: data };
}

/** Client components can't import queries.ts (server-only) directly -- this wraps it for the adjust-stock dialog's batch picker. */
export async function listBatchesForClinicProductAction(
  clinicId: string,
  productId: string,
): Promise<InventoryBatchRow[]> {
  return listClinicProductBatches(clinicId, productId);
}

export async function updateReorderThresholdsAction(
  inventoryId: string,
  reorderLevel: string,
  reorderQuantity: string,
): Promise<{ error: string } | { error?: undefined }> {
  const organizationId = await currentOrganizationId();

  const supabase = await getSupabaseServerClient();
  const { data: row } = await supabase
    .from("inventory")
    .select("clinic_id")
    .eq("id", inventoryId)
    .maybeSingle();
  if (!row) return { error: "Inventory record not found, or you don't have access to it." };

  await requirePermission("inventory.manage", { organizationId, clinicId: row.clinic_id });

  const level = Number(reorderLevel);
  const qty = Number(reorderQuantity);
  if (!Number.isFinite(level) || level < 0 || !Number.isFinite(qty) || qty < 0) {
    return { error: "Enter valid, non-negative thresholds." };
  }

  const { error } = await supabase
    .from("inventory")
    .update({ reorder_level: level, reorder_quantity: qty })
    .eq("id", inventoryId);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return {};
}
