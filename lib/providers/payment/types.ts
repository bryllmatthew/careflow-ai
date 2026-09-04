/**
 * docs/ARCHITECTURE.md's provider-interface principle applied to payments
 * (docs/PRODUCT_SPEC.md Phase 6 section 46): the core application talks
 * only to this interface, never to a specific vendor's SDK. Adding a real
 * provider later means a new implementation of PaymentProvider, not a
 * rewrite of the invoice/payment logic that calls it.
 *
 * Every amount here is a decimal string (CLAUDE.md "money is numeric(14,2),
 * read as a string"), matching how the rest of the app treats money end to
 * end.
 */

export type PaymentProviderKey = "manual" | "generic";

export type CreatePaymentSessionInput = {
  invoiceId: string;
  amount: string;
  currency: string;
  /** For the provider's own checkout UI, never persisted beyond what the provider needs. */
  description: string;
  returnUrl: string;
};

export type CreatePaymentSessionResult =
  | { success: true; checkoutUrl: string; providerPaymentIntentId: string }
  | { success: false; error: string; retryable: boolean };

export type VerifyPaymentResult =
  | { status: "succeeded"; providerTransactionId: string; paidAt: string }
  | { status: "pending" | "processing" }
  | { status: "failed"; error: string }
  | { status: "not_found" };

export type RefundPaymentResult =
  | { success: true; providerRefundId: string }
  | { success: false; error: string; retryable: boolean };

export type WebhookEvent = {
  eventId: string;
  eventType: string;
  providerPaymentIntentId?: string;
  providerTransactionId?: string;
  amount?: string;
  status?: "succeeded" | "failed" | "cancelled";
};

export interface PaymentProvider {
  readonly key: PaymentProviderKey;

  /** Step 1 of online payment initiation -- never marks anything succeeded (docs/PRODUCT_SPEC.md Phase 6 section 15). */
  createPaymentSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult>;

  /** Server-side status check -- used by the return/callback handler and the reconciliation job, never trusted from the client. */
  verifyPayment(providerPaymentIntentId: string): Promise<VerifyPaymentResult>;

  refundPayment(providerTransactionId: string, amount: string): Promise<RefundPaymentResult>;

  /** True only if the raw body's signature matches this provider's scheme for the given secret. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean;

  /** Returns null for a body that doesn't parse as this provider's event shape -- the caller must not guess. */
  parseWebhookEvent(rawBody: string): WebhookEvent | null;
}
