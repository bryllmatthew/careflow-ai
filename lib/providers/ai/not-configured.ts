import "server-only";
import type { AIProvider, GenerateReplyInput, GenerateReplyResult } from "./types";

/**
 * The real state in this environment: no ANTHROPIC_API_KEY is set (see
 * .env.example). Mirrors lib/providers/payment/not-configured.ts and
 * lib/providers/messaging/not-configured.ts -- this NEVER fabricates an
 * assistant reply; it says plainly that the assistant isn't configured, the
 * same honesty rule docs/AI_TOOLS.md section 19 requires of the model
 * itself ("if data is unavailable, say so -- do not guess").
 */
export class NotConfiguredAIProvider implements AIProvider {
  readonly key = "not_configured" as const;

  async generateReply(_input: GenerateReplyInput): Promise<GenerateReplyResult> {
    return {
      success: false,
      error: "The AI assistant is not configured yet. Set ANTHROPIC_API_KEY to enable it.",
      retryable: false,
    };
  }
}
