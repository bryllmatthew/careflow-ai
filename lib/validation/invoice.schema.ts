import { z } from "zod";

export const invoiceStatuses = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
  "cancelled",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];
export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  cancelled: "Cancelled",
};

const moneyString = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0, `Enter a valid ${label}`);

export const createInvoiceSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  clinicId: z.string().min(1, "Clinic is required"),
  appointmentId: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  dueDate: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const invoiceItemSchema = z.object({
  serviceId: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  description: z.string().trim().min(1, "Description is required").max(300),
  quantity: z.coerce.number().positive("Quantity must be greater than 0").max(9999),
  unitPrice: moneyString("unit price"),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const discountSchema = z
  .object({
    discountType: z.enum(["fixed", "percentage"]).nullable(),
    discountValue: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => !v.discountType || (v.discountValue && /^\d+(\.\d{1,2})?$/.test(v.discountValue)), {
    message: "Enter a valid discount value",
    path: ["discountValue"],
  })
  .refine((v) => v.discountType !== "percentage" || Number(v.discountValue) <= 100, {
    message: "A percentage discount can't exceed 100%",
    path: ["discountValue"],
  });
export type DiscountInput = z.infer<typeof discountSchema>;

export const taxSchema = z.object({
  taxRate: z.coerce.number().min(0, "Tax rate can't be negative").max(100, "Tax rate can't exceed 100%"),
});
