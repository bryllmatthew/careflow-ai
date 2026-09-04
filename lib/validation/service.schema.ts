import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const serviceFormSchema = z.object({
  name: z.string().trim().min(1, "Service name is required").max(200),
  description: optionalText(1000),
  durationMinutes: z.coerce
    .number()
    .int("Duration must be a whole number of minutes")
    .min(1, "Duration must be at least 1 minute")
    .max(1440, "Duration can't exceed 24 hours"),
  // Money as a string end-to-end (CLAUDE.md "Database conventions") -- parsed
  // here only to validate it's a real non-negative number, then sent to the
  // database as the original string, never as a JS number.
  price: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0, "Enter a valid price"),
  cost: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Enter a valid cost"),
  clinicId: z.string().min(1, "Clinic is required"),
});
export type ServiceFormInput = z.infer<typeof serviceFormSchema>;
