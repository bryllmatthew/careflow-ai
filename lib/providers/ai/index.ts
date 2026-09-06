import "server-only";
import { AnthropicAIProvider } from "./anthropic";
import { NotConfiguredAIProvider } from "./not-configured";
import type { AIProvider } from "./types";

/**
 * Single seam the tool-call loop calls through -- see
 * lib/providers/payment/index.ts and lib/providers/messaging/index.ts for
 * the identical pattern. A new provider is a new branch here, never a
 * change to lib/ai/service.ts.
 */
export function getAIProvider(): AIProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new NotConfiguredAIProvider();
  }
  return new AnthropicAIProvider(apiKey, process.env.AI_MODEL || "claude-sonnet-5");
}
