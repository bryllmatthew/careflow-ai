import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/providers/ai";
import type { AIContentBlock, AIMessage } from "@/lib/providers/ai/types";
import { buildSystemPrompt } from "./system-prompt";
import { toolDefinitionsForProvider, executeToolCall, getTool } from "./tools/registry";
import { isActionTool } from "./tools/types";
import type { AIContext } from "./context";
import { NotFoundError } from "@/lib/auth/errors";

/** Hard ceiling on how many times the model may call tools in a row before this turn gives up and returns whatever it has -- an infinite tool loop is a bug, not a valid conversation. */
const MAX_TOOL_ITERATIONS = 6;

export type ConversationSummary = { id: string; title: string | null; updatedAt: string };

export async function listConversations(_ctx: AIContext): Promise<ConversationSummary[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

export async function createConversation(ctx: AIContext): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ organization_id: ctx.organizationId, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create conversation.");
  return data.id;
}

async function loadHistory(conversationId: string): Promise<AIMessage[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as unknown as AIContentBlock[],
  }));
}

/**
 * organization_id/user_id are included here to satisfy the generated
 * Insert type (both columns are NOT NULL) -- the actual values are
 * IGNORED and overwritten by the ai_stamp_tenancy_from_conversation
 * trigger (migration 20260908090000) before the row is checked or stored,
 * so a caller can never widen a message's tenancy by passing something
 * different here. ctx.organizationId/ctx.userId are passed rather than
 * placeholders only so this reads as what it should be, not junk.
 */
async function insertMessage(
  conversationId: string,
  ctx: AIContext,
  role: "user" | "assistant",
  content: AIContentBlock[],
): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      role,
      content: content as unknown as never,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to persist message.");
  return data.id;
}

async function recordUsage(
  ctx: AIContext,
  conversationId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("ai_usage").insert({
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    conversation_id: conversationId,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });
  if (error) console.error("[ai] failed to record usage:", error.message);
}

async function touchConversationTitle(
  conversationId: string,
  firstUserText: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("ai_conversations")
    .select("title")
    .eq("id", conversationId)
    .maybeSingle();
  if (data && !data.title) {
    await supabase
      .from("ai_conversations")
      .update({ title: firstUserText.slice(0, 80) })
      .eq("id", conversationId);
  }
}

export type PendingAction = {
  toolName: string;
  input: unknown;
  summary: string;
  details: Record<string, unknown>;
};

export type DisplayMessage = { id: string; role: "user" | "assistant"; text: string };

/**
 * Text-only reconstruction of a conversation for the initial page render.
 * Tool-use/tool-result plumbing is intentionally not replayed into the UI
 * here (a pending confirmation from a previous session is not restored --
 * see docs/modules/AI_ASSISTANT.md "Deferred"); this only needs to show
 * what was actually said.
 */
export async function getConversationDisplayMessages(
  conversationId: string,
): Promise<DisplayMessage[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const messages: DisplayMessage[] = [];
  for (const row of data ?? []) {
    const blocks = row.content as unknown as AIContentBlock[];
    const text = blocks
      .filter((b): b is Extract<AIContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) messages.push({ id: row.id, role: row.role as "user" | "assistant", text });
  }
  return messages;
}

export type AssistantTurnResult =
  | {
      success: true;
      reply: string;
      toolActivity: { name: string; isAction: boolean }[];
      pendingActions: PendingAction[];
    }
  | { success: false; error: string };

/**
 * Runs one full user turn: persist the user's message, then loop the
 * provider <-> tool-registry cycle (docs/AI_TOOLS.md section 4's
 * architecture diagram: User -> AI -> Intent -> Permission Check -> Tool ->
 * Authorized Query -> Result -> AI Response) until the model produces a
 * final text reply or the iteration cap is hit. Every tool call is
 * authorized and audited independently by lib/ai/tools/registry.ts --
 * nothing here bypasses that.
 */
export async function runAssistantTurn(
  conversationId: string,
  ctx: AIContext,
  userText: string,
): Promise<AssistantTurnResult> {
  const supabase = await getSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation)
    throw new NotFoundError("Conversation not found, or you don't have access to it.");

  await insertMessage(conversationId, ctx, "user", [{ type: "text", text: userText }]);
  await touchConversationTitle(conversationId, userText);

  const provider = getAIProvider();
  const system = buildSystemPrompt(ctx);
  const tools = toolDefinitionsForProvider(ctx);
  const toolActivity: { name: string; isAction: boolean }[] = [];
  const pendingActions: PendingAction[] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const history = await loadHistory(conversationId);
    const result = await provider.generateReply({ system, messages: history, tools });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    await recordUsage(
      ctx,
      conversationId,
      result.model,
      result.usage.inputTokens,
      result.usage.outputTokens,
    );
    const assistantMessageId = await insertMessage(
      conversationId,
      ctx,
      "assistant",
      result.message.content,
    );

    const toolUseBlocks = result.message.content.filter(
      (b): b is Extract<AIContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );

    if (result.stopReason !== "tool_use" || toolUseBlocks.length === 0) {
      const text = result.message.content
        .filter((b): b is Extract<AIContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { success: true, reply: text || "(no response)", toolActivity, pendingActions };
    }

    const toolResults: AIContentBlock[] = [];
    for (const block of toolUseBlocks) {
      const tool = getTool(block.name);
      toolActivity.push({ name: block.name, isAction: tool ? isActionTool(tool) : false });

      const toolResult = await executeToolCall({
        toolName: block.name,
        rawInput: block.input,
        ctx,
        conversationId,
        messageId: assistantMessageId,
        toolUseId: block.id,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(toolResult.ok ? toolResult.data : { error: toolResult.error }),
        is_error: !toolResult.ok,
      });

      if (toolResult.ok && tool && isActionTool(tool)) {
        const data = toolResult.data as {
          requiresConfirmation?: boolean;
          summary?: string;
          details?: Record<string, unknown>;
        };
        if (data.requiresConfirmation) {
          pendingActions.push({
            toolName: block.name,
            input: block.input,
            summary: data.summary ?? "",
            details: data.details ?? {},
          });
        }
      }
    }

    await insertMessage(conversationId, ctx, "user", toolResults);
  }

  return {
    success: false,
    error: "The assistant used too many tool calls in a row. Try rephrasing your question.",
  };
}
