import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AIContentBlock,
  AIMessage,
  AIProvider,
  AIStopReason,
  AIToolDefinition,
  GenerateReplyInput,
  GenerateReplyResult,
} from "./types";

const MAX_TOKENS = 4096;

function toAnthropicTool(tool: AIToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

function toAnthropicContent(blocks: AIContentBlock[]): Anthropic.ContentBlockParam[] {
  return blocks.map((block): Anthropic.ContentBlockParam => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "tool_use":
        return { type: "tool_use", id: block.id, name: block.name, input: block.input };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error,
        };
    }
  });
}

function toAnthropicMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));
}

function fromAnthropicContent(content: Anthropic.ContentBlock[]): AIContentBlock[] {
  const blocks: AIContentBlock[] = [];
  for (const block of content) {
    if (block.type === "text") {
      blocks.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      blocks.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
    // Thinking blocks are intentionally dropped -- lib/ai/service.ts persists
    // and replays only text/tool_use/tool_result, matching what CareFlow's
    // UI ever renders (docs/AI_TOOLS.md never asks for visible chain-of-thought).
  }
  return blocks;
}

function stopReasonOf(reason: Anthropic.Message["stop_reason"]): AIStopReason {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    default:
      return "other";
  }
}

/**
 * The real implementation, used whenever ANTHROPIC_API_KEY is set (see
 * lib/providers/ai/index.ts). Non-streaming: the tool-call loop in
 * lib/ai/service.ts needs the complete message (including every tool_use
 * block) before it can execute tools and persist the turn, and responses
 * here are short operational answers, never long-form generation -- see
 * docs/modules/AI_ASSISTANT.md "Deferred" for why token-level streaming to
 * the browser is not built yet.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly key = "anthropic" as const;
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: input.system,
        messages: toAnthropicMessages(input.messages),
        tools: input.tools.map(toAnthropicTool),
      });

      return {
        success: true,
        message: { role: "assistant", content: fromAnthropicContent(response.content) },
        stopReason: stopReasonOf(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        return { success: false, error: "AI provider authentication failed.", retryable: false };
      }
      if (error instanceof Anthropic.RateLimitError) {
        return {
          success: false,
          error: "AI provider is rate-limited. Try again shortly.",
          retryable: true,
        };
      }
      if (error instanceof Anthropic.APIConnectionError) {
        return { success: false, error: "Could not reach the AI provider.", retryable: true };
      }
      if (error instanceof Anthropic.APIError) {
        return {
          success: false,
          error: `AI provider error: ${error.message}`,
          retryable: error.status >= 500,
        };
      }
      return { success: false, error: "Unexpected AI provider failure.", retryable: false };
    }
  }
}
