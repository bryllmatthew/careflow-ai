import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentProvider,
  PaymentProviderKey,
  CreatePaymentSessionInput,
  CreatePaymentSessionResult,
  VerifyPaymentResult,
  RefundPaymentResult,
  WebhookEvent,
} from "./types";

/**
 * The real state today: no payment provider account exists to connect to
 * (no Stripe/PayMongo/Xendit merchant account in this environment). This
 * NEVER claims a checkout was created or a refund processed --
 * docs/PRODUCT_SPEC.md Phase 6 section 51 is explicit that "online payments
 * are not configured" must be shown honestly, the same rule Phase 4 applied
 * to messaging (lib/providers/messaging/not-configured.ts).
 *
 * Its webhook-verification methods are the one part that's genuinely real
 * and working: HMAC-SHA256 over the raw body, the scheme every major
 * provider (Stripe, PayMongo, Xendit) uses in some form. Gated by
 * PAYMENT_PROVIDER_WEBHOOK_SECRET -- unset, verification honestly fails
 * closed rather than accepting anything. This lets the webhook pipeline
 * (app/api/webhooks/payments/[provider]/route.ts) be exercised end-to-end
 * with a real signed test payload without needing a live merchant account,
 * per section 52's "test/sandbox mode" -- see the Phase 6 report for how it
 * was verified.
 */
export class NotConfiguredPaymentProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = "generic";

  async createPaymentSession(
    _input: CreatePaymentSessionInput,
  ): Promise<CreatePaymentSessionResult> {
    return { success: false, error: "Online payments are not configured.", retryable: false };
  }

  async verifyPayment(_providerPaymentIntentId: string): Promise<VerifyPaymentResult> {
    return { status: "not_found" };
  }

  async refundPayment(
    _providerTransactionId: string,
    _amount: string,
  ): Promise<RefundPaymentResult> {
    return { success: false, error: "Online payments are not configured.", retryable: false };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
    if (!secret || !signatureHeader) return false;
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(signatureHeader, "hex");
    // Constant-time comparison -- a naive === leaks how many leading bytes
    // matched via response-time differences, letting an attacker guess a
    // valid signature byte by byte.
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  }

  parseWebhookEvent(rawBody: string): WebhookEvent | null {
    try {
      const data = JSON.parse(rawBody) as Record<string, unknown>;
      if (typeof data.event_id !== "string" || typeof data.event_type !== "string") return null;
      return {
        eventId: data.event_id,
        eventType: data.event_type,
        providerPaymentIntentId:
          typeof data.provider_payment_intent_id === "string"
            ? data.provider_payment_intent_id
            : undefined,
        providerTransactionId:
          typeof data.provider_transaction_id === "string"
            ? data.provider_transaction_id
            : undefined,
        amount: typeof data.amount === "string" ? data.amount : undefined,
        status:
          data.status === "succeeded" || data.status === "failed" || data.status === "cancelled"
            ? data.status
            : undefined,
      };
    } catch {
      return null;
    }
  }
}
