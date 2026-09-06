import { z } from "zod";
import { getDashboardSummary } from "@/app/(app)/reports/dashboard-queries";
import {
  getRevenueSummary,
  getRevenueByClinic,
  getRevenueByPaymentMethod,
} from "@/app/(app)/reports/revenue-queries";
import { getReceivablesReport } from "@/app/(app)/reports/receivables-queries";
import { defineReadTool } from "./types";
import { rangeInputSchema, clinicIdSchema, resolveRange, resolveClinicId } from "./shared";

/**
 * docs/AI_TOOLS.md section 6/7/12 -- every figure here comes from
 * app/(app)/reports/*-queries.ts, the SAME functions the Executive
 * Dashboard and Financial Reports page call. No KPI is recomputed here
 * (CLAUDE.md section 66 / docs/modules/REPORTING.md's explicit
 * anti-discrepancy rule) -- this file only adapts their output into the
 * tool-result shape and applies the tool's own permission check.
 */

export const getDashboardSummaryTool = defineReadTool({
  name: "get_dashboard_summary",
  description:
    "High-level business performance for a period: revenue, appointments (completed/cancelled/no-show), new/returning patients, and outstanding invoices. Use for broad 'how are we doing' questions.",
  schema: rangeInputSchema.extend({ clinicId: clinicIdSchema }),
  permission: "reports.view",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_month");
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const summary = await getDashboardSummary(
      { organizationId: ctx.organizationId, clinicId, range },
      ctx.clinics,
    );

    const includeFinancial = ctx.permissions.has("reports.financial");
    return {
      ok: true,
      data: {
        period: range.label,
        currency: ctx.currency,
        revenue: includeFinancial ? summary.revenue : "not authorized for this user",
        appointments: summary.appointments,
        newPatients: summary.newPatients,
        followUps: summary.followUps,
        inventoryAlerts: summary.inventoryAlerts,
        clinicComparison: clinicId ? undefined : summary.clinicPerformance,
      },
    };
  },
});

export const getRevenueSummaryTool = defineReadTool({
  name: "get_revenue_summary",
  description:
    "Financial revenue summary for a period: invoiced, collected, refunded, net collected, and current outstanding balance, with change vs. the previous equal-length period. Optionally broken down by clinic and by payment method.",
  schema: rangeInputSchema.extend({
    clinicId: clinicIdSchema,
    breakdownByClinic: z.boolean().optional().describe("Include a per-clinic revenue breakdown."),
    breakdownByPaymentMethod: z
      .boolean()
      .optional()
      .describe("Include a breakdown by payment method."),
  }),
  permission: "reports.financial",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_month");
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const scope = { organizationId: ctx.organizationId, clinicId, range };
    const [summary, byClinic, byMethod] = await Promise.all([
      getRevenueSummary(scope),
      input.breakdownByClinic
        ? getRevenueByClinic(ctx.organizationId, range, ctx.clinics)
        : Promise.resolve(undefined),
      input.breakdownByPaymentMethod
        ? getRevenueByPaymentMethod(scope)
        : Promise.resolve(undefined),
    ]);
    return {
      ok: true,
      data: { period: range.label, currency: ctx.currency, ...summary, byClinic, byMethod },
    };
  },
});

export const getUnpaidInvoicesTool = defineReadTool({
  name: "get_unpaid_invoices",
  description:
    "Lists unpaid/overdue invoices (issued, overdue, or partially paid with a balance greater than zero), with an accounts-receivable aging bucket for each. Supports an optional clinic filter and aging bucket filter.",
  schema: z.object({
    clinicId: clinicIdSchema,
    agingBucket: z.enum(["current", "1_30", "31_60", "61_90", "90_plus"]).optional(),
    page: z.number().int().min(1).optional(),
  }),
  permission: "reports.financial",
  handler: async (input, ctx) => {
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const result = await getReceivablesReport(ctx.organizationId, {
      clinicId,
      agingBucket: input.agingBucket,
      page: input.page,
    });
    return {
      ok: true,
      data: { currency: ctx.currency, total: result.total, invoices: result.rows.slice(0, 25) },
    };
  },
});

export const getPaymentSummaryTool = defineReadTool({
  name: "get_payment_summary",
  description:
    "Collected revenue for a period, broken down by payment method (cash, card, transfer, etc).",
  schema: rangeInputSchema.extend({ clinicId: clinicIdSchema }),
  permission: "reports.financial",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_month");
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const byMethod = await getRevenueByPaymentMethod({
      organizationId: ctx.organizationId,
      clinicId,
      range,
    });
    return { ok: true, data: { period: range.label, currency: ctx.currency, byMethod } };
  },
});

export const getSalesSummaryTool = defineReadTool({
  name: "get_sales_summary",
  description:
    "Invoiced sales volume for a period, optionally by clinic -- how much business was billed, not necessarily collected yet.",
  schema: rangeInputSchema.extend({ clinicId: clinicIdSchema }),
  permission: "reports.financial",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_month");
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const scope = { organizationId: ctx.organizationId, clinicId, range };
    const [summary, byClinic] = await Promise.all([
      getRevenueSummary(scope),
      getRevenueByClinic(ctx.organizationId, range, ctx.clinics),
    ]);
    return {
      ok: true,
      data: { period: range.label, currency: ctx.currency, invoiced: summary.invoiced, byClinic },
    };
  },
});
