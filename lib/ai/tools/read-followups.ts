import { z } from "zod";
import { listFollowUps } from "@/app/(app)/followups/queries";
import { followUpTypes, followUpPriorities } from "@/lib/validation/followup.schema";
import { defineReadTool } from "./types";
import { clinicIdSchema, resolveClinicId } from "./shared";

export const getFollowUpsTool = defineReadTool({
  name: "get_followups",
  description:
    "Lists follow-ups, optionally filtered by clinic, type, priority, assignee, or bucket (overdue/today/upcoming/completed).",
  schema: z.object({
    clinicId: clinicIdSchema,
    assignedTo: z.string().uuid().optional(),
    type: z.enum(followUpTypes).optional(),
    priority: z.enum(followUpPriorities).optional(),
    bucket: z.enum(["overdue", "today", "upcoming", "completed", "all"]).optional(),
  }),
  permission: "followups.view",
  handler: async (input, ctx) => {
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const result = await listFollowUps(ctx.organizationId, {
      clinicId,
      assignedTo: input.assignedTo,
      type: input.type,
      priority: input.priority,
      bucket: input.bucket,
    });
    return { ok: true, data: { total: result.total, followUps: result.rows.slice(0, 25) } };
  },
});

export const getOverdueFollowUpsTool = defineReadTool({
  name: "get_overdue_followups",
  description:
    "Follow-ups that are past their due date and still pending or in progress -- 'who needs follow-up today' / 'who hasn't been contacted' questions.",
  schema: z.object({ clinicId: clinicIdSchema }),
  permission: "followups.view",
  handler: async (input, ctx) => {
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const result = await listFollowUps(ctx.organizationId, { clinicId, bucket: "overdue" });
    return { ok: true, data: { total: result.total, followUps: result.rows.slice(0, 25) } };
  },
});
