import { z } from "zod";

/**
 * Mirrors the CHECK constraint on organizations.business_type
 * (supabase/migrations/20260903072153_tenancy_core.sql).
 */
export const businessTypes = [
  "dental",
  "medical",
  "therapy",
  "aesthetic",
  "wellness",
  "other",
] as const;

export const businessTypeLabels: Record<(typeof businessTypes)[number], string> = {
  dental: "Dental",
  medical: "Medical",
  therapy: "Therapy",
  aesthetic: "Aesthetic",
  wellness: "Wellness",
  other: "Other",
};

export const createOrganizationSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name is required").max(200),
  businessType: z.enum(businessTypes),
  clinicName: z.string().trim().max(200).optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
