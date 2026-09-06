import { z } from "zod";

export const paymentStatuses = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  partially_refunded: "Partially Refunded",
  refunded: "Refunded",
};

export const paymentMethods = [
  "cash",
  "bank_transfer",
  "card",
  "ewallet",
  "online",
  "other",
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  ewallet: "E-Wallet",
  online: "Online Payment",
  other: "Other",
};

/** The methods record_manual_payment() actually accepts -- see migration 0016. */
export const manualPaymentMethods = ["cash", "bank_transfer", "other"] as const;
export type ManualPaymentMethod = (typeof manualPaymentMethods)[number];

const moneyString = z
  .string()
  .trim()
  .refine(
    (v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0,
    "Enter a valid amount greater than 0",
  );

export const recordManualPaymentSchema = z.object({
  amount: moneyString,
  paymentMethod: z.enum(manualPaymentMethods),
  referenceNumber: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;

export const refundPaymentSchema = z.object({
  amount: moneyString,
  reason: z.string().trim().min(1, "A reason is required").max(500),
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
