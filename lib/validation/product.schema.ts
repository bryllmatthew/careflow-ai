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

const optionalMoneyString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Enter a valid amount");

const quantityString = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) >= 0, "Enter a valid quantity");

/** Suggestions only -- section 5: "do not hardcode categories in a way that prevents organizations from creating their own." */
export const suggestedProductCategories = [
  "Medical Supplies",
  "Dental Supplies",
  "Aesthetic Supplies",
  "Consumables",
  "Equipment",
  "Retail Products",
  "Cleaning Supplies",
  "Office Supplies",
  "Other",
] as const;

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(200),
  sku: optionalText(80),
  barcode: optionalText(80),
  description: optionalText(1000),
  category: optionalText(100),
  brand: optionalText(100),
  unitOfMeasure: z.string().trim().min(1, "Unit is required").max(40).default("unit"),
  unitCost: moneyString,
  sellingPrice: optionalMoneyString,
  trackInventory: z.boolean().default(true),
  trackExpiration: z.boolean().default(false),
  reorderLevel: quantityString.default("0"),
  reorderQuantity: quantityString.default("0"),
  supplierId: optionalText(200),
  supplierSku: optionalText(80),
});
export type ProductFormInput = z.infer<typeof productFormSchema>;

export const productStatuses = ["active", "inactive"] as const;
export type ProductStatus = (typeof productStatuses)[number];
