import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const clinicFormSchema = z.object({
  name: z.string().trim().min(1, "Clinic name is required").max(200),
  address: optionalText(500),
  phone: optionalText(50),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email address"),
  // IANA timezone. Not validated against a full tz database here (would need
  // a library dependency for one form field); a bad value fails harmlessly
  // at display/scheduling time in a later phase, not silently or unsafely.
  timezone: z.string().trim().min(1, "Timezone is required").max(100),
});
export type ClinicFormInput = z.infer<typeof clinicFormSchema>;
