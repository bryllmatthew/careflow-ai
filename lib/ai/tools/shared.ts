import { z } from "zod";
import {
  DATE_RANGE_KEYS,
  resolveDateRange,
  type ResolvedDateRange,
} from "@/lib/reporting/date-range";
import type { AIContext } from "@/lib/ai/context";

/**
 * The same date-range vocabulary the dashboard/report filter bar uses
 * (lib/reporting/date-range.ts) -- so "this month vs last month" resolves
 * through the ONE date-boundary implementation in the app, never a
 * model-guessed date (docs/AI_TOOLS.md section 3, CLAUDE.md section 66).
 */
export const rangeInputSchema = z
  .object({
    range: z
      .enum(DATE_RANGE_KEYS)
      .optional()
      .describe("A named period. Omit together with from/to to use the tool's default."),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Custom range start, YYYY-MM-DD. Requires `to` and range: 'custom'."),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Custom range end, YYYY-MM-DD. Requires `from` and range: 'custom'."),
  })
  .partial();

export function resolveRange(
  input: { range?: string; from?: string; to?: string },
  ctx: AIContext,
  fallback: (typeof DATE_RANGE_KEYS)[number],
): ResolvedDateRange {
  const key = (input.range as (typeof DATE_RANGE_KEYS)[number] | undefined) ?? fallback;
  if (key === "custom" && input.from && input.to) {
    return resolveDateRange("custom", ctx.timezone, { from: input.from, to: input.to });
  }
  return resolveDateRange(key === "custom" ? fallback : key, ctx.timezone);
}

/** Optional clinic filter shared by nearly every tool -- validated against ctx.clinics, never trusted blindly even though RLS is the real backstop. */
export const clinicIdSchema = z
  .string()
  .uuid()
  .optional()
  .describe("Restrict to one clinic. Omit for all clinics the user can access.");

export function resolveClinicId(clinicId: string | undefined, ctx: AIContext): string | undefined {
  if (!clinicId) return undefined;
  // Not an authorization boundary (RLS is) -- this just gives a clear tool
  // error instead of a silently-empty result when the model names a clinic
  // the user can't access or that doesn't exist.
  return ctx.clinics.some((c) => c.id === clinicId) ? clinicId : undefined;
}
