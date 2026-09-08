import "server-only";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AIContext } from "@/lib/ai/context";
import type { AIToolDefinition } from "@/lib/providers/ai/types";
import type { AITool, AIToolResult } from "./types";
import { isActionTool } from "./types";
import {
  getDashboardSummaryTool,
  getRevenueSummaryTool,
  getUnpaidInvoicesTool,
  getPaymentSummaryTool,
  getSalesSummaryTool,
} from "./read-financial";
import { getAppointmentsTool, getUpcomingAppointmentsTool } from "./read-appointments";
import { searchPatientsTool, getPatientTool, getPatientHistoryTool } from "./read-patients";
import { getFollowUpsTool, getOverdueFollowUpsTool } from "./read-followups";
import {
  getInventoryStatusTool,
  getLowStockItemsTool,
  getInventoryUsageTool,
} from "./read-inventory";
import { getClinicPerformanceTool, getPractitionerPerformanceTool } from "./read-performance";
import { getOnlineBookingSummaryTool } from "./read-booking";
import { actionTools } from "./action-tools";

/**
 * The complete tool set (docs/AI_TOOLS.md section 4/16): 18 read-only tools
 * -- 17 from Phase 9 plus Phase 10's get_online_booking_summary --
 * -- each a thin, permission-checked wrapper around an EXISTING Phase 5-8
 * query function, never a parallel KPI calculation (CLAUDE.md section 66,
 * docs/modules/REPORTING.md's anti-discrepancy rule) -- plus 7 controlled
 * action tools, each calling the SAME Server Action a human would.
 */
export const allTools: AITool[] = [
  getDashboardSummaryTool,
  getRevenueSummaryTool,
  getUnpaidInvoicesTool,
  getPaymentSummaryTool,
  getSalesSummaryTool,
  getAppointmentsTool,
  getUpcomingAppointmentsTool,
  searchPatientsTool,
  getPatientTool,
  getPatientHistoryTool,
  getFollowUpsTool,
  getOverdueFollowUpsTool,
  getInventoryStatusTool,
  getLowStockItemsTool,
  getInventoryUsageTool,
  getClinicPerformanceTool,
  getPractitionerPerformanceTool,
  getOnlineBookingSummaryTool,
  ...actionTools,
];

const toolsByName = new Map(allTools.map((t) => [t.name, t]));

export function getTool(name: string): AITool | undefined {
  return toolsByName.get(name);
}

function hasRequiredPermission(tool: AITool, ctx: AIContext): boolean {
  const required = Array.isArray(tool.permission) ? tool.permission : [tool.permission];
  return required.some((p) => ctx.permissions.has(p));
}

type ExecutionRecord = {
  ctx: AIContext;
  conversationId: string;
  messageId: string | null;
  toolUseId: string;
  toolName: string;
  input: unknown;
  status: "success" | "error" | "denied";
  isAction: boolean;
  outputSummary?: unknown;
  errorMessage?: string;
};

/**
 * organization_id/user_id are supplied from ctx to satisfy the generated
 * Insert type (both NOT NULL) -- like ai_messages, the actual values are
 * overwritten by the ai_stamp_tenancy_from_conversation trigger before the
 * row is checked or stored, so this can never record a call under the
 * wrong tenant regardless of what's passed here.
 */
async function recordToolCall(record: ExecutionRecord): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("ai_tool_calls").insert({
    conversation_id: record.conversationId,
    organization_id: record.ctx.organizationId,
    user_id: record.ctx.userId,
    message_id: record.messageId ?? undefined,
    tool_use_id: record.toolUseId,
    tool_name: record.toolName,
    input: record.input as never,
    status: record.status,
    is_action: record.isAction,
    output_summary: (record.outputSummary ?? null) as never,
    error_message: record.errorMessage,
  });
  if (error) {
    console.error(`[ai] failed to record tool call ${record.toolName}:`, error.message);
  }
}

/**
 * Runs ONE tool call: permission check -> input validation -> execution,
 * then persists an audit row regardless of outcome (docs/AI_TOOLS.md
 * section 22). The model itself never decides authorization -- this
 * function is the one place that does (section 5's "the application
 * decides"), using the SAME Permission catalogue and the caller's SAME
 * pre-resolved AIContext every other tool call in the conversation shares.
 *
 * Action tools are PROPOSED here, never executed -- see
 * lib/ai/tools/types.ts's ActionTool.propose vs .execute, and
 * app/api/ai/actions/confirm/route.ts for where `execute` actually runs.
 */
export async function executeToolCall(params: {
  toolName: string;
  rawInput: unknown;
  ctx: AIContext;
  conversationId: string;
  messageId: string;
  toolUseId: string;
}): Promise<AIToolResult> {
  const { toolName, rawInput, ctx, conversationId, messageId, toolUseId } = params;
  const tool = getTool(toolName);

  if (!tool) {
    const result: AIToolResult = { ok: false, error: `Unknown tool: ${toolName}` };
    await recordToolCall({
      ctx,
      conversationId,
      messageId,
      toolUseId,
      toolName,
      input: rawInput,
      status: "error",
      isAction: false,
      errorMessage: result.error,
    });
    return result;
  }

  if (!ctx.permissions.has("ai.use") || !hasRequiredPermission(tool, ctx)) {
    const result: AIToolResult = { ok: false, error: "You don't have permission to do that." };
    await recordToolCall({
      ctx,
      conversationId,
      messageId,
      toolUseId,
      toolName,
      input: rawInput,
      status: "denied",
      isAction: isActionTool(tool),
      errorMessage: result.error,
    });
    return result;
  }

  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    const result: AIToolResult = {
      ok: false,
      error: `Invalid input: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
    };
    await recordToolCall({
      ctx,
      conversationId,
      messageId,
      toolUseId,
      toolName,
      input: rawInput,
      status: "error",
      isAction: isActionTool(tool),
      errorMessage: result.error,
    });
    return result;
  }

  try {
    if (isActionTool(tool)) {
      const proposal = await tool.propose(parsed.data, ctx);
      const result: AIToolResult = {
        ok: true,
        data: { requiresConfirmation: true, tool: tool.name, input: parsed.data, ...proposal },
      };
      await recordToolCall({
        ctx,
        conversationId,
        messageId,
        toolUseId,
        toolName,
        input: parsed.data,
        status: "success",
        isAction: true,
        outputSummary: result.data,
      });
      return result;
    }

    const result = await tool.handler(parsed.data, ctx);
    await recordToolCall({
      ctx,
      conversationId,
      messageId,
      toolUseId,
      toolName,
      input: parsed.data,
      status: result.ok ? "success" : "error",
      isAction: false,
      outputSummary: result.ok ? result.data : undefined,
      errorMessage: result.ok ? undefined : result.error,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected tool error.";
    await recordToolCall({
      ctx,
      conversationId,
      messageId,
      toolUseId,
      toolName,
      input: parsed.data,
      status: "error",
      isAction: isActionTool(tool),
      errorMessage: message,
    });
    return { ok: false, error: message };
  }
}

/**
 * The confirmed-action path (app/api/ai/actions/confirm/route.ts): re-checks
 * permission and re-validates input independently of whatever the chat loop
 * already did -- a proposal is not a capability grant, so this repeats the
 * same checks executeToolCall() performs, never trusts that a prior
 * "success" proposal is still valid.
 */
export async function executeConfirmedAction(params: {
  toolName: string;
  rawInput: unknown;
  ctx: AIContext;
  conversationId: string;
}): Promise<AIToolResult> {
  const { toolName, rawInput, ctx, conversationId } = params;
  const tool = getTool(toolName);

  if (!tool || !isActionTool(tool)) {
    return { ok: false, error: `Unknown action: ${toolName}` };
  }
  if (!ctx.permissions.has("ai.use") || !hasRequiredPermission(tool, ctx)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
    };
  }

  try {
    const result = await tool.execute(parsed.data, ctx);
    await recordToolCall({
      ctx,
      conversationId,
      messageId: null,
      toolUseId: `confirm-${toolName}-${Date.now()}`,
      toolName,
      input: parsed.data,
      status: result.ok ? "success" : "error",
      isAction: true,
      outputSummary: result.ok ? result.data : undefined,
      errorMessage: result.ok ? undefined : result.error,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected action error.";
    return { ok: false, error: message };
  }
}

/**
 * JSON Schema tool definitions for the provider request (lib/ai/service.ts).
 * Only tools the caller actually holds permission for are exposed -- the
 * model is never even told an unauthorized tool exists (defense in depth
 * on top of executeToolCall()'s own check, and it keeps the tool list, and
 * so the prompt cache prefix, stable per permission set rather than per
 * user). Tenancy fields (organization_id, clinic_id-as-a-boundary) never
 * appear in any schema below -- every schema in lib/ai/tools/*.ts only ever
 * takes an optional clinicId as a FILTER, resolved against ctx.clinics, not
 * a trust boundary (CLAUDE.md rule 4).
 */
export function toolDefinitionsForProvider(ctx: AIContext): AIToolDefinition[] {
  return allTools
    .filter((tool) => hasRequiredPermission(tool, ctx))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.schema, { target: "draft-7" }) as Record<string, unknown>,
    }));
}
