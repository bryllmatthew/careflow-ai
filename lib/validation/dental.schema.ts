import { z } from "zod";
import { uuidLike } from "./common";
import { DENTAL_CONDITIONS, DENTAL_SURFACES } from "@/lib/dental/vocabulary";

/**
 * Inputs for the dental write actions. Every rule here is ALSO enforced by the
 * database (migration 0025's domains, guards and RLS) -- these exist so a
 * dentist gets a sentence instead of a Postgres error code, not as the
 * boundary.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** ISO 3950 permanent-tooth codes: quadrants 1-4, positions 1-8. */
const toothCode = z
  .number()
  .int()
  .refine((n) => n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8, "Unknown tooth");

const surfaces = z.array(z.enum(DENTAL_SURFACES)).max(6).default([]);

export const recordConditionsSchema = z.object({
  toothCodes: z.array(toothCode).min(1, "Select at least one tooth").max(32),
  condition: z.enum(DENTAL_CONDITIONS, { error: "Choose a condition" }),
  surfaces,
  notes: optionalText(2000),
});
export type RecordConditionsInput = z.input<typeof recordConditionsSchema>;

export const conditionStatusSchema = z
  .object({
    status: z.enum(["resolved", "entered_in_error"]),
    reason: optionalText(1000),
  })
  .refine((v) => v.status !== "entered_in_error" || Boolean(v.reason), {
    message: "Say why this was entered in error",
    path: ["reason"],
  });
export type ConditionStatusInput = z.input<typeof conditionStatusSchema>;

export const planTreatmentSchema = z
  .object({
    procedure: optionalText(200),
    teeth: z.array(z.object({ toothCode, surfaces })).min(1, "Select at least one tooth").max(32),
    serviceId: uuidLike.optional(),
    appointmentId: uuidLike.optional(),
    practitionerId: uuidLike.optional(),
    resultingCondition: z.enum(DENTAL_CONDITIONS).optional(),
    notes: optionalText(4000),
    /** Record a procedure performed today, in one step (needs dental.complete). */
    completeNow: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.procedure) || Boolean(v.serviceId), {
    message: "Name the procedure or choose a service",
    path: ["procedure"],
  });
export type PlanTreatmentInput = z.input<typeof planTreatmentSchema>;

export const closeTreatmentSchema = z
  .object({
    reason: optionalText(1000),
    enteredInError: z.boolean().default(false),
  })
  .refine((v) => !v.enteredInError || Boolean(v.reason), {
    message: "Say why this was entered in error",
    path: ["reason"],
  });
export type CloseTreatmentInput = z.input<typeof closeTreatmentSchema>;
