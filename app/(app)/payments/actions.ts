"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError } from "@/lib/auth/errors";
import {
  recordManualPaymentSchema,
  refundPaymentSchema,
  type RecordManualPaymentInput,
  type RefundPaymentInput,
} from "@/lib/validation/payment.schema";
import { notifyUser, resolvePaymentFollowUps } from "@/lib/automation/dispatch";
import { getPaymentProvider } from "@/lib/providers/payment";
import type { Json } from "@/lib/db/types.generated";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new NotFoundError("No active organization.");
  return orgId;
}

/** See app/(app)/invoices/actions.ts for why this is a literal discriminant, not a bolt-on optional field. */
type RecordPaymentResult = { success: true; paymentId: string } | { success: false; error: string };
type RefundResult = { success: true; refundId: string } | { success: false; error: string };
type InitiateOnlineResult =
  { success: true; checkoutUrl: string } | { success: false; error: string };

/** Maps the Postgres error codes record_manual_payment()/record_refund() actually raise into user-facing text. */
function friendlyRpcError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "23514":
      return error.message.includes("amount")
        ? "Enter a valid amount -- it must be greater than zero and cannot exceed the outstanding balance."
        : "This invoice or payment is not in a state that allows this action.";
    case "42501":
      return "You don't have permission to do that.";
    case "23505":
      return "This transaction has already been recorded.";
    default:
      return error.message;
  }
}

async function safeAudit(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  organizationId: string,
  action: string,
  entityId: string,
  metadata: Record<string, Json> = {},
) {
  try {
    await supabase.rpc("log_audit_event", {
      p_organization_id: organizationId,
      p_action: action,
      p_entity_type: "payments",
      p_entity_id: entityId,
      p_metadata: metadata,
    });
  } catch (err) {
    console.error(`[audit] log_audit_event failed (${action}):`, err);
  }
}

export async function recordManualPaymentAction(
  invoiceId: string,
  input: RecordManualPaymentInput,
): Promise<RecordPaymentResult> {
  const parsed = recordManualPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  const supabase = await getSupabaseServerClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("clinic_id, patient_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice)
    return { success: false, error: "Invoice not found, or you don't have access to it." };

  await requirePermission("payments.record_manual", {
    organizationId,
    clinicId: invoice.clinic_id,
  });

  const { data: paymentId, error } = await supabase.rpc("record_manual_payment", {
    p_invoice_id: invoiceId,
    p_amount: Number(parsed.data.amount),
    p_payment_method: parsed.data.paymentMethod,
    p_reference_number: parsed.data.referenceNumber,
  });

  if (error) return { success: false, error: friendlyRpcError(error) };

  await safeAudit(supabase, organizationId, "payment.recorded_manual", paymentId, {
    invoiceId,
    amount: parsed.data.amount,
    paymentMethod: parsed.data.paymentMethod,
  });

  const auth = await getAuthContext();
  if (auth?.userId) {
    await notifyUser(supabase, {
      organizationId,
      userId: auth.userId,
      type: "payment_succeeded",
      title: "Payment recorded",
      message: `A payment of ${parsed.data.amount} was recorded against invoice.`,
      entityType: "invoices",
      entityId: invoiceId,
    });
  }

  const { data: refreshed } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (refreshed?.status === "paid") {
    await resolvePaymentFollowUps(supabase, invoiceId);
  }

  revalidatePath("/payments");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/patients/${invoice.patient_id}`);
  return { success: true, paymentId };
}

export async function refundPaymentAction(
  paymentId: string,
  input: RefundPaymentInput,
): Promise<RefundResult> {
  const parsed = refundPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  const supabase = await getSupabaseServerClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("invoice_id, clinic_id, patient_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment)
    return { success: false, error: "Payment not found, or you don't have access to it." };

  // requirePermission is defense-in-depth here -- record_refund() is
  // SECURITY DEFINER and performs its own internal authorization check
  // (see the migration), since a DEFINER function bypasses RLS/grants.
  await requirePermission("payments.refund", { organizationId, clinicId: payment.clinic_id });

  const { data: refundId, error } = await supabase.rpc("record_refund", {
    p_payment_id: paymentId,
    p_amount: Number(parsed.data.amount),
    p_reason: parsed.data.reason,
  });

  if (error) return { success: false, error: friendlyRpcError(error) };

  await safeAudit(supabase, organizationId, "payment.refunded", paymentId, {
    refundId,
    amount: parsed.data.amount,
    reason: parsed.data.reason,
  });

  const auth = await getAuthContext();
  if (auth?.userId) {
    await notifyUser(supabase, {
      organizationId,
      userId: auth.userId,
      type: "payment_refunded",
      title: "Refund recorded",
      message: `A refund of ${parsed.data.amount} was recorded.`,
      entityType: "payments",
      entityId: paymentId,
    });
  }

  revalidatePath("/payments");
  revalidatePath(`/invoices/${payment.invoice_id}`);
  revalidatePath(`/patients/${payment.patient_id}`);
  return { success: true, refundId };
}

/**
 * Step 1 of online payment initiation (docs/PRODUCT_SPEC.md Phase 6 section
 * 15) -- calls the provider abstraction and, on success only, persists a
 * `pending` payment row for the webhook/return handler to later resolve.
 * With no live provider configured (lib/providers/payment/not-configured.ts)
 * this always returns the honest "not configured" error -- it never fakes a
 * checkout URL. The code path is real and will start working the moment a
 * real PaymentProvider implementation is registered.
 */
export async function initiateOnlinePaymentAction(
  invoiceId: string,
): Promise<InitiateOnlineResult> {
  const organizationId = await currentOrganizationId();
  const supabase = await getSupabaseServerClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("clinic_id, patient_id, total, amount_paid, currency, status, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice)
    return { success: false, error: "Invoice not found, or you don't have access to it." };

  await requirePermission("payments.process", { organizationId, clinicId: invoice.clinic_id });

  if (!["issued", "overdue", "partially_paid"].includes(invoice.status)) {
    return { success: false, error: "This invoice is not open for payment." };
  }

  const balance = invoice.total - invoice.amount_paid;
  if (balance <= 0) {
    return { success: false, error: "This invoice has no outstanding balance." };
  }

  const provider = getPaymentProvider();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const result = await provider.createPaymentSession({
    invoiceId,
    amount: balance.toFixed(2),
    currency: invoice.currency,
    description: `Invoice ${invoice.invoice_number ?? invoiceId}`,
    returnUrl: `${appUrl}/payments/return?invoice=${invoiceId}`,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const { error } = await supabase.from("payments").insert({
    organization_id: organizationId,
    clinic_id: invoice.clinic_id,
    patient_id: invoice.patient_id,
    invoice_id: invoiceId,
    amount: balance,
    currency: invoice.currency,
    payment_method: "online",
    status: "pending",
    provider: provider.key,
    provider_payment_intent_id: result.providerPaymentIntentId,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true, checkoutUrl: result.checkoutUrl };
}

/**
 * The return/callback path (docs/PRODUCT_SPEC.md Phase 6 section 49): the
 * customer being redirected back here is NOT proof of payment -- this
 * re-verifies status with the provider server-side before ever telling the
 * UI anything succeeded. The webhook remains the primary, authoritative path;
 * this exists only to give the returning customer an immediate, honest
 * status if the webhook hasn't landed yet.
 */
export async function checkOnlinePaymentStatusAction(
  invoiceId: string,
): Promise<{ status: "succeeded" | "pending" | "failed" | "not_found" }> {
  const organizationId = await currentOrganizationId();
  const supabase = await getSupabaseServerClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("clinic_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { status: "not_found" };
  await requirePermission("payments.view", { organizationId, clinicId: invoice.clinic_id });

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, provider_payment_intent_id")
    .eq("invoice_id", invoiceId)
    .neq("provider", "manual")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) return { status: "not_found" };
  if (payment.status === "succeeded") return { status: "succeeded" };
  if (payment.status === "failed" || payment.status === "cancelled") return { status: "failed" };
  if (!payment.provider_payment_intent_id) return { status: "pending" };

  // Not proof of anything by itself -- re-verify with the provider directly,
  // never trust that arriving at this URL means payment succeeded.
  const provider = getPaymentProvider();
  const verified = await provider.verifyPayment(payment.provider_payment_intent_id);

  if (verified.status === "succeeded") {
    await supabase
      .from("payments")
      .update({
        status: "succeeded",
        provider_transaction_id: verified.providerTransactionId,
        paid_at: verified.paidAt,
      })
      .eq("id", payment.id)
      .eq("status", "pending");
    return { status: "succeeded" };
  }
  if (verified.status === "failed") {
    await supabase
      .from("payments")
      .update({ status: "failed", failure_reason: verified.error })
      .eq("id", payment.id)
      .eq("status", "pending");
    return { status: "failed" };
  }
  return { status: "pending" };
}
