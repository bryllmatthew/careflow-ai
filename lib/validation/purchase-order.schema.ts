import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const moneyString = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0, "Enter a valid amount");

const quantityString = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0, "Enter a quantity greater than 0");

export const purchaseOrderStatuses = [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof purchaseOrderStatuses)[number];
export const purchaseOrderStatusLabels: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

export const createPurchaseOrderSchema = z.object({
  clinicId: z.string().min(1, "Clinic is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  expectedDate: optionalText(10),
  notes: optionalText(1000),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  description: z.string().trim().min(1, "Description is required").max(300),
  quantityOrdered: quantityString,
  unitCost: moneyString,
});
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;

export const receivePurchaseOrderItemSchema = z.object({
  quantity: quantityString,
  batchNumber: optionalText(80),
  lotNumber: optionalText(80),
  expirationDate: optionalText(10),
  notes: optionalText(500),
});
export type ReceivePurchaseOrderItemInput = z.infer<typeof receivePurchaseOrderItemSchema>;
