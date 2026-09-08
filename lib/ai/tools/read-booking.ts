import { getOnlineBookingMetrics } from "@/app/(app)/booking/queries";
import { defineReadTool } from "./types";
import { rangeInputSchema, clinicIdSchema, resolveRange, resolveClinicId } from "./shared";

/**
 * Phase 10's single AI tool (brief section 44).
 *
 * Read-only, and a thin wrapper over the SAME query the booking reports use
 * -- never a second aggregation the assistant could disagree with the
 * dashboard about (docs/modules/REPORTING.md's anti-discrepancy rule). There
 * is deliberately no booking ACTION tool: section 44 rules out autonomous AI
 * booking, and a public booking has patient-supplied contact details the
 * assistant has no business inventing.
 *
 * Gated on reports.view rather than booking.view: this returns aggregate
 * volumes and attribution, which is reporting, and every other aggregate tool
 * in the registry uses the same key. A user who can see the online booking
 * dashboard but holds no reporting permission is not thereby entitled to have
 * the assistant summarise the organization's marketing performance.
 */
export const getOnlineBookingSummaryTool = defineReadTool({
  name: "get_online_booking_summary",
  description:
    "How many appointments came from the clinic's own online booking page in a period, what share of all bookings that is, and the breakdown by service, practitioner, marketing source and campaign. Use for 'how many online bookings did we get this week' and 'which campaign is working' questions.",
  schema: rangeInputSchema.extend({ clinicId: clinicIdSchema }),
  permission: "reports.view",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "this_week");
    const clinicId = resolveClinicId(input.clinicId, ctx);

    const metrics = await getOnlineBookingMetrics(ctx.organizationId, {
      startISO: range.startUtc,
      endISO: range.endUtc,
      clinicId,
    });

    return {
      ok: true,
      data: {
        period: range.label,
        totalBookings: metrics.total,
        onlineBookings: metrics.online,
        onlineSharePercent: Math.round(metrics.onlineShare * 1000) / 10,
        byService: metrics.byService.slice(0, 10),
        byPractitioner: metrics.byPractitioner.slice(0, 10),
        // "direct" means the patient reached the booking page without going
        // through a tracked campaign link -- not that attribution is missing.
        bySource: metrics.bySource.slice(0, 10),
        byCampaign: metrics.byCampaign.slice(0, 10),
      },
    };
  },
});
