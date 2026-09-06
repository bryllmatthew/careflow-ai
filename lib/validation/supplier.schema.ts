import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(200),
  contactPerson: optionalText(200),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email"),
  phone: optionalText(40),
  address: optionalText(500),
  notes: optionalText(1000),
});
export type SupplierFormInput = z.infer<typeof supplierFormSchema>;

export const supplierStatuses = ["active", "inactive"] as const;
export type SupplierStatus = (typeof supplierStatuses)[number];
