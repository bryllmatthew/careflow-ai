import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider, paymentWebhookSecret } from "@/lib/providers/payment";
import type { Json } from "@/lib/db/types.generated";
import { notifyUser, resolvePaymentFollowUps } from "@/lib/automation/dispatch";

/**
 * The authoritative payment-confirmation path (CLAUDE.md section 63 /
 * docs/PRODUCT_SPEC.md Phase 6 section 63, "Critical Financial Principle"):
 * Customer -> Payment Provider -> Provider webhook -> HERE -> payments row
 * -> invoice recompute trigger -> invoice status. Nothing in the frontend
 * can mark a payment succeeded; this route is the only writer of a payment's
 * terminal status for an online payment.
 *
 * No end user -- the provider calls this directly, authenticated by
 * signature, not a session. That's the service-role exception recorded in
 * eslint.config.mjs's allowlist, matching the two cron routes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await params;

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-webhook-signature") ?? request.headers.get("stripe-signature");
  const secret = paymentWebhookSecret();

  if (!secret) {
    return NextResponse.json({ error: "Payment webhooks are not configured on this server." }, { status: 503 });
  }

  const provider = getPaymentProvider();
  if (providerParam !== provider.key) {
    return NextResponse.json({ error: "Unknown payment provider." }, { status: 404 });
  }

  if (!provider.verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = provider.parseWebhookEvent(rawBody);
  if (!event) {
    return NextResponse.json({ error: "Malformed webhook payload." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency: the same event delivered twice (a provider retry) must
  // have exactly one financial effect. The unique index on
  // (provider, event_id) makes the second insert fail with 23505, which we
  // treat as "already handled", not an error.
  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    payload = { raw: rawBody };
  }

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider: provider.key,
    event_id: event.eventId,
    event_type: event.eventType,
    payload,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ status: "already_processed" });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (!event.providerPaymentIntentId && !event.providerTransactionId) {
    await markProcessed(supabase, provider.key, event.eventId);
    return NextResponse.json({ status: "acknowledged", note: "No payment identifier on this event." });
  }

  let paymentQuery = supabase
    .from("payments")
    .select("id, organization_id, invoice_id, patient_id, status, created_by")
    .eq("provider", provider.key);
  paymentQuery = event.providerPaymentIntentId
    ? paymentQuery.eq("provider_payment_intent_id", event.providerPaymentIntentId)
    : paymentQuery.eq("provider_transaction_id", event.providerTransactionId!);

  const { data: payment } = await paymentQuery.maybeSingle();

  if (!payment) {
    // A webhook for a payment we never initiated (or already reconciled
    // away). Acknowledge so the provider stops retrying, but don't guess.
    await markProcessed(supabase, provider.key, event.eventId);
    return NextResponse.json({ status: "acknowledged", note: "No matching payment found." });
  }

  // Only a still-pending/processing payment is eligible to be settled by a
  // webhook -- never overwrite a payment already in a terminal state
  // (succeeded/refunded/etc). This is what keeps a duplicate or out-of-order
  // delivery from silently altering history (CLAUDE.md section 45).
  if (payment.status !== "pending" && payment.status !== "processing") {
    await markProcessed(supabase, provider.key, event.eventId);
    return NextResponse.json({ status: "acknowledged", note: "Payment already in a terminal state." });
  }

  if (event.status === "succeeded") {
    await supabase
      .from("payments")
      .update({
        status: "succeeded",
        provider_transaction_id: event.providerTransactionId ?? null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"]);

    if (payment.created_by) {
      await notifyUser(supabase, {
        organizationId: payment.organization_id,
        userId: payment.created_by,
        type: "payment_succeeded",
        title: "Online payment received",
        message: "An online payment succeeded.",
        entityType: "invoices",
        entityId: payment.invoice_id,
      });
    }

    const { data: invoice } = await supabase.from("invoices").select("status").eq("id", payment.invoice_id).maybeSingle();
    if (invoice?.status === "paid") {
      await resolvePaymentFollowUps(supabase, payment.invoice_id);
    }
  } else if (event.status === "failed" || event.status === "cancelled") {
    await supabase
      .from("payments")
      .update({ status: event.status, failure_reason: "Reported by provider webhook." })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"]);

    if (payment.created_by) {
      await notifyUser(supabase, {
        organizationId: payment.organization_id,
        userId: payment.created_by,
        type: "payment_failed",
        title: "Online payment failed",
        message: "An online payment did not succeed.",
        entityType: "invoices",
        entityId: payment.invoice_id,
      });
    }
  }
  // Any other event type/status is acknowledged but not acted on -- a real
  // provider sends many event kinds this integration doesn't model yet.

  await markProcessed(supabase, provider.key, event.eventId);
  return NextResponse.json({ status: "processed" });
}

async function markProcessed(
  supabase: ReturnType<typeof createAdminClient>,
  providerKey: string,
  eventId: string,
): Promise<void> {
  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", providerKey)
    .eq("event_id", eventId);
}
