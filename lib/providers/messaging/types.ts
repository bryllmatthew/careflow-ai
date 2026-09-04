/**
 * docs/ARCHITECTURE.md's provider-interface principle applied to messaging:
 * automation logic (lib/automation/dispatch.ts) never talks to a channel
 * directly, only through this interface -- so adding a real email/SMS
 * vendor later is a new implementation of MessagingProvider, not a rewrite
 * of the dispatch/processor logic.
 */
export type MessagingChannel = "internal" | "email" | "sms";

export type SendMessageInput = {
  channel: MessagingChannel;
  /** For 'internal', the recipient's profile id. For 'email'/'sms', an address/number. */
  to: string;
  subject?: string;
  body: string;
};

export type SendMessageResult =
  | { success: true; providerRef?: string }
  | { success: false; error: string; retryable: boolean };

export interface MessagingProvider {
  send(input: SendMessageInput): Promise<SendMessageResult>;
}
