import { z } from "zod";

/** Mirrors the CHECK constraint on patients.gender (migration 0011). */
export const patientGenders = ["female", "male", "other", "prefer_not_to_say"] as const;
export const genderLabels: Record<(typeof patientGenders)[number], string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

/** Mirrors the CHECK constraint on patients.status. */
export const patientStatuses = ["active", "inactive", "archived"] as const;
export type PatientStatus = (typeof patientStatuses)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const patientFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email address"),
  phone: optionalText(50),
  // Plain string, not z.coerce.date(): a <input type="date"> value
  // ("YYYY-MM-DD") is what the form sends, and a date-of-birth has no time
  // component to lose by keeping it a string through to the date column.
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date"),
  gender: z.enum(patientGenders).optional(),
  address: optionalText(500),
  notes: optionalText(2000),
  clinicId: z.string().min(1, "Clinic is required"),
  assignedStaffId: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type PatientFormInput = z.infer<typeof patientFormSchema>;
