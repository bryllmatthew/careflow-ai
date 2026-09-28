import { z } from "zod";
import { CLINIC_TYPES } from "@/lib/clinic-types";

/**
 * The organization's type at sign-up is the clinic type of its first clinic
 * (create_organization(), migration 0024) and the default for clinics added
 * later. The list itself lives in lib/clinic-types.ts, the one place clinic
 * types and their capabilities are defined.
 */
export {
  CLINIC_TYPES as businessTypes,
  CLINIC_TYPE_LABELS as businessTypeLabels,
} from "@/lib/clinic-types";

export const createOrganizationSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name is required").max(200),
  // Required, with no default: the clinic type switches specialty modules on
  // and off, so it is a decision the clinic makes rather than a value it
  // inherits by skipping a field.
  businessType: z.enum(CLINIC_TYPES, { error: "Choose your clinic type" }),
  clinicName: z.string().trim().max(200).optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
