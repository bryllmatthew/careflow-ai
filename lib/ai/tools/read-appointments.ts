import { z } from "zod";
import { listAppointments, listAppointmentsForRange } from "@/app/(app)/appointments/queries";
import { appointmentStatuses } from "@/lib/validation/appointment.schema";
import { defineReadTool } from "./types";
import { rangeInputSchema, clinicIdSchema, resolveRange, resolveClinicId } from "./shared";

export const getAppointmentsTool = defineReadTool({
  name: "get_appointments",
  description:
    "Lists appointments for a date range, optionally filtered by clinic, practitioner (staffId), status, or patient. Most recent first. Use get_upcoming_appointments instead for 'what's next' questions.",
  schema: rangeInputSchema.extend({
    clinicId: clinicIdSchema,
    staffId: z.string().uuid().optional().describe("Filter to one practitioner."),
    patientId: z.string().uuid().optional(),
    status: z.enum(appointmentStatuses).optional(),
    page: z.number().int().min(1).optional(),
  }),
  permission: "appointments.view",
  handler: async (input, ctx) => {
    const range = resolveRange(input, ctx, "today");
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const result = await listAppointments(ctx.organizationId, {
      clinicId,
      staffId: input.staffId,
      patientId: input.patientId,
      status: input.status,
      startDate: range.startUtc,
      endDate: range.endUtc,
      page: input.page,
    });
    return {
      ok: true,
      data: { period: range.label, total: result.total, appointments: result.rows.slice(0, 25) },
    };
  },
});

export const getUpcomingAppointmentsTool = defineReadTool({
  name: "get_upcoming_appointments",
  description:
    "The next appointments from right now onward, soonest first -- for 'what's next' / 'what do I have coming up' questions.",
  schema: z.object({
    clinicId: clinicIdSchema,
    staffId: z.string().uuid().optional(),
    daysAhead: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe("How many days ahead to look. Defaults to 14."),
  }),
  permission: "appointments.view",
  handler: async (input, ctx) => {
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const daysAhead = input.daysAhead ?? 14;
    const rows = await listAppointmentsForRange(ctx.organizationId, {
      startISO: ctx.nowIso,
      endISO: new Date(Date.now() + daysAhead * 86_400_000).toISOString(),
      clinicId,
      staffId: input.staffId,
    });
    const upcoming = rows.filter((r) => !["cancelled", "completed", "no_show"].includes(r.status));
    return { ok: true, data: { daysAhead, appointments: upcoming.slice(0, 25) } };
  },
});
