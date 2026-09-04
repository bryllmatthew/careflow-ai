import "server-only";
import { NotConfiguredPaymentProvider } from "./not-configured";
import type { PaymentProvider } from "./types";

/**
 * Single seam the rest of the app calls through -- swapping in a real
 * provider later means adding a branch here, not touching invoice/payment
 * logic. Only one implementation exists today; see not-configured.ts for
 * why.
 */
export function getPaymentProvider(): PaymentProvider {
  return new NotConfiguredPaymentProvider();
}

export function paymentWebhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SIGNING_SECRET ?? "";
}
