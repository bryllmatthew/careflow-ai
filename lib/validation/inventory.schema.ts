import { z } from "zod";

const quantityString = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0, "Enter a quantity greater than 0");

const optionalMoneyString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Enter a valid cost");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const receiveStockSchema = z.object({
  clinicId: z.string().min(1, "Clinic is required"),
  productId: z.string().min(1, "Product is required"),
  quantity: quantityString,
  unitCost: optionalMoneyString,
  batchNumber: optionalText(80),
  lotNumber: optionalText(80),
  expirationDate: optionalText(10),
  notes: optionalText(500),
});
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;

export const adjustmentMovementTypes = [
  "manual_adjustment",
  "damaged",
  "expired",
  "return",
  "correction",
] as const;
export type AdjustmentMovementType = (typeof adjustmentMovementTypes)[number];
export const adjustmentMovementTypeLabels: Record<AdjustmentMovementType, string> = {
  manual_adjustment: "Manual adjustment",
  damaged: "Damaged",
  expired: "Expired",
  return: "Return",
  correction: "Correction",
};

const nonZeroQuantityDeltaString = z
  .string()
  .trim()
  .refine((v) => /^-?\d+(\.\d{1,3})?$/.test(v) && Number(v) !== 0, "Enter a non-zero quantity");

export const adjustInventorySchema = z.object({
  clinicId: z.string().min(1, "Clinic is required"),
  productId: z.string().min(1, "Product is required"),
  quantityDelta: nonZeroQuantityDeltaString,
  movementType: z.enum(adjustmentMovementTypes),
  reason: z.string().trim().min(1, "A reason is required").max(500),
  batchId: optionalText(200),
});
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;

export const transferInventorySchema = z
  .object({
    fromClinicId: z.string().min(1, "Source clinic is required"),
    toClinicId: z.string().min(1, "Destination clinic is required"),
    productId: z.string().min(1, "Product is required"),
    quantity: quantityString,
    notes: optionalText(500),
  })
  .refine((v) => v.fromClinicId !== v.toClinicId, {
    message: "Source and destination clinic must be different",
    path: ["toClinicId"],
  });
export type TransferInventoryInput = z.infer<typeof transferInventorySchema>;

export const movementTypeLabels: Record<string, string> = {
  purchase_received: "Stock received",
  sale: "Sale",
  service_usage: "Used in service",
  manual_adjustment: "Manual adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  return: "Return",
  damaged: "Damaged",
  expired: "Expired",
  correction: "Correction",
};

/** Centralized so no threshold is hardcoded per-component (section 15). */
export const EXPIRING_SOON_DAYS = 30;

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function stockStatus(quantityOnHand: number, reorderLevel: number): StockStatus {
  if (quantityOnHand <= 0) return "out_of_stock";
  if (quantityOnHand <= reorderLevel) return "low_stock";
  return "in_stock";
}

export const stockStatusLabels: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

export type ExpirationStatus = "expired" | "expiring_soon" | "valid";

export function expirationStatus(
  expirationDate: string | null,
  thresholdDays = EXPIRING_SOON_DAYS,
): ExpirationStatus | null {
  if (!expirationDate) return null;
  const days = (new Date(expirationDate).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= thresholdDays) return "expiring_soon";
  return "valid";
}

export const expirationStatusLabels: Record<ExpirationStatus, string> = {
  expired: "Expired",
  expiring_soon: "Expiring Soon",
  valid: "Valid",
};
