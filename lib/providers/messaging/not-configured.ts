import "server-only";
import type { MessagingProvider, SendMessageInput, SendMessageResult } from "./types";

/**
 * The real state for email/SMS/WhatsApp today: no vendor is configured. This
 * NEVER claims success -- docs/PRODUCT_SPEC.md Phase 4 section 35 is
 * explicit that "SMS sent" / "Email delivered" must never be simulated.
 * Failing here is not retryable: a missing provider configuration doesn't
 * fix itself between retries the way a transient network error might (see
 * lib/automation/dispatch.ts's retry policy).
 */
export class NotConfiguredProvider implements MessagingProvider {
  constructor(private readonly channel: string) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    void input;
    return {
      success: false,
      error: `No ${this.channel} provider is configured.`,
      retryable: false,
    };
  }
}
