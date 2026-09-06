/**
 * docs/ARCHITECTURE.md's provider-interface principle applied to the AI
 * assistant (docs/CLAUDE.md Phase 9): the tool-call loop (lib/ai/service.ts)
 * talks only to this interface, never to a vendor SDK directly -- the same
 * shape already used for PaymentProvider (lib/providers/payment) and
 * MessagingProvider (lib/providers/messaging).
 *
 * Deliberately modeled after the Anthropic Messages API's own request/
 * response shape (content blocks, tool_use/tool_result) rather than a
 * generic "chat completion" abstraction -- CareFlow only ever targets one
 * AI vendor (Anthropic), and flattening to a lowest-common-denominator
 * shape here would just be indirection with no second implementation to
 * justify it. What this interface buys is a single seam
 * (getAIProvider()) so the tool-call loop, persistence, and UI layers never
 * import the Anthropic SDK directly, and a NotConfigured implementation is
 * possible for local dev with no API key (see not-configured.ts).
 */

export type AIContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type AIMessage = {
  role: "user" | "assistant";
  content: AIContentBlock[];
};

export type AIToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool's input -- tenancy fields (organization_id, clinic_id) are never included (CLAUDE.md rule 4). */
  inputSchema: Record<string, unknown>;
};

export type GenerateReplyInput = {
  system: string;
  messages: AIMessage[];
  tools: AIToolDefinition[];
};

export type AIStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export type GenerateReplyResult =
  | {
      success: true;
      message: AIMessage;
      stopReason: AIStopReason;
      usage: { inputTokens: number; outputTokens: number };
      model: string;
    }
  | { success: false; error: string; retryable: boolean };

export interface AIProvider {
  readonly key: "anthropic" | "not_configured";
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
