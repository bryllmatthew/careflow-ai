import {
  getClinicPerformance,
  getPractitionerPerformance,
} from "@/app/(app)/reports/performance-queries";
import { defineReadTool } from "./types";
import { rangeInputSchema, clinicIdSchema, resolveRange, resolveClinicId } from "./shared";

export const getClinicPerformanceTool = defineReadTool({
  name: "get_clinic_performance",
  description:
    "Compares every clinic the user can access on revenue and appointment volume for a period -- 'which clinic generated the most revenue' questions.",
  schema: rangeInputSchema,
  permission: "reports.view",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_month");
    const rows = await getClinicPerformance(
      { organizationId: ctx.organizationId, range },
      ctx.clinics,
    );
    return { ok: true, data: { period: range.label, currency: ctx.currency, clinics: rows } };
  },
});

export const getPractitionerPerformanceTool = defineReadTool({
  name: "get_practitioner_performance",
  description:
    "Per-practitioner appointment volume and attributed revenue (only from invoices explicitly linked to their appointment) for a period.",
  schema: rangeInputSchema.extend({ clinicId: clinicIdSchema }),
  permission: "reports.view",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_month");
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const rows = await getPractitionerPerformance(
      { organizationId: ctx.organizationId, range },
      clinicId,
    );
    return { ok: true, data: { period: range.label, currency: ctx.currency, practitioners: rows } };
  },
});
