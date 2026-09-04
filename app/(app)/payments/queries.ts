import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/lib/validation/payment.schema";

export const PAYMENTS_PAGE_SIZE = 20;

const PAYMENT_SELECT =
  "id, amount, currency, payment_method, status, provider, provider_transaction_id, " +
  "provider_payment_intent_id, reference_number, paid_at, failure_reason, refunded_amount, " +
  "created_at, clinic_id, clinics(name), patient_id, patients(first_name, last_name), " +
  "invoice_id, invoices(invoice_number)";

export type PaymentRow = {
  id: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  status: string;
  provider: string;
  providerTransactionId: string | null;
  providerPaymentIntentId: string | null;
  referenceNumber: string | null;
  paidAt: string | null;
  failureReason: string | null;
  refundedAmount: string;
  createdAt: string;
  clinicId: string;
  clinicName: string | null;
  patientId: string;
  patientName: string;
  invoiceId: string;
  invoiceNumber: string | null;
};

type RawPayment = {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  provider: string;
  provider_transaction_id: string | null;
  provider_payment_intent_id: string | null;
  reference_number: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  refunded_amount: number;
  created_at: string;
  clinic_id: string;
  clinics: { name: string } | null;
  patient_id: string;
  patients: { first_name: string; last_name: string } | null;
  invoice_id: string;
  invoices: { invoice_number: string | null } | null;
};

function mapPayment(p: RawPayment): PaymentRow {
  return {
    id: p.id,
    amount: p.amount.toFixed(2),
    currency: p.currency,
    paymentMethod: p.payment_method,
    status: p.status,
    provider: p.provider,
    providerTransactionId: p.provider_transaction_id,
    providerPaymentIntentId: p.provider_payment_intent_id,
    referenceNumber: p.reference_number,
    paidAt: p.paid_at,
    failureReason: p.failure_reason,
    refundedAmount: p.refunded_amount.toFixed(2),
    createdAt: p.created_at,
    clinicId: p.clinic_id,
    clinicName: p.clinics?.name ?? null,
    patientId: p.patient_id,
    patientName: p.patients ? `${p.patients.first_name} ${p.patients.last_name}` : "Unknown",
    invoiceId: p.invoice_id,
    invoiceNumber: p.invoices?.invoice_number ?? null,
  };
}

export type PaymentListFilters = {
  q?: string;
  clinicId?: string;
  status?: PaymentStatus | "all";
  paymentMethod?: string;
  patientId?: string;
  invoiceId?: string;
  page?: number;
};

export async function listPayments(
  organizationId: string,
  filters: PaymentListFilters,
): Promise<{ rows: PaymentRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PAYMENTS_PAGE_SIZE;
  const to = from + PAYMENTS_PAGE_SIZE - 1;

  let query = supabase
    .from("payments")
    .select(PAYMENT_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.patientId) query = query.eq("patient_id", filters.patientId);
  if (filters.invoiceId) query = query.eq("invoice_id", filters.invoiceId);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);

  // Search by invoice number, patient name, or provider/reference id -- each
  // a separate parameterized lookup merged via .in(), same reasoning as
  // invoices' own search (app/(app)/invoices/queries.ts): PostgREST's
  // .or() doesn't escape interpolated free text.
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    const [byInvoiceNumber, matchingPatients, byRef, byProviderTxn] = await Promise.all([
      supabase.from("invoices").select("id").eq("organization_id", organizationId).ilike("invoice_number", `%${q}%`),
      supabase.from("patients").select("id").eq("organization_id", organizationId).ilike("search_text", `%${q.toLowerCase()}%`),
      supabase.from("payments").select("id").eq("organization_id", organizationId).ilike("reference_number", `%${q}%`),
      supabase.from("payments").select("id").eq("organization_id", organizationId).ilike("provider_transaction_id", `%${q}%`),
    ]);

    const invoiceIds = (byInvoiceNumber.data ?? []).map((r) => r.id);
    const patientIds = (matchingPatients.data ?? []).map((r) => r.id);
    const byInvoice =
      invoiceIds.length > 0
        ? await supabase.from("payments").select("id").eq("organization_id", organizationId).in("invoice_id", invoiceIds)
        : { data: [] as { id: string }[] };
    const byPatient =
      patientIds.length > 0
        ? await supabase.from("payments").select("id").eq("organization_id", organizationId).in("patient_id", patientIds)
        : { data: [] as { id: string }[] };

    const matchedIds = new Set([
      ...(byInvoice.data ?? []).map((r) => r.id),
      ...(byPatient.data ?? []).map((r) => r.id),
      ...(byRef.data ?? []).map((r) => r.id),
      ...(byProviderTxn.data ?? []).map((r) => r.id),
    ]);
    if (matchedIds.size === 0) return { rows: [], total: 0 };
    query = query.in("id", Array.from(matchedIds));
  }

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);

  return {
    rows: (data ?? []).map((p) => mapPayment(p as unknown as RawPayment)),
    total: count ?? 0,
  };
}

export async function getPaymentById(paymentId: string): Promise<PaymentRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("payments").select(PAYMENT_SELECT).eq("id", paymentId).maybeSingle();
  return data ? mapPayment(data as unknown as RawPayment) : null;
}

export async function listInvoicePayments(invoiceId: string): Promise<PaymentRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((p) => mapPayment(p as unknown as RawPayment));
}

export async function listPatientPayments(patientId: string): Promise<PaymentRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((p) => mapPayment(p as unknown as RawPayment));
}

export type RefundRow = {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  reason: string;
  status: string;
  providerRefundId: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

export async function listPaymentRefunds(paymentId: string): Promise<RefundRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("refunds")
    .select("id, payment_id, invoice_id, amount, reason, status, provider_refund_id, failure_reason, created_at, completed_at")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    paymentId: r.payment_id,
    invoiceId: r.invoice_id,
    amount: r.amount.toFixed(2),
    reason: r.reason,
    status: r.status,
    providerRefundId: r.provider_refund_id,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));
}

export async function listPatientRefunds(patientId: string): Promise<RefundRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("refunds")
    .select(
      "id, payment_id, invoice_id, amount, reason, status, provider_refund_id, failure_reason, created_at, completed_at, payments!inner(patient_id)",
    )
    .eq("payments.patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((r) => ({
    id: r.id,
    paymentId: r.payment_id,
    invoiceId: r.invoice_id,
    amount: r.amount.toFixed(2),
    reason: r.reason,
    status: r.status,
    providerRefundId: r.provider_refund_id,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));
}

/** For the dashboard (docs/PRODUCT_SPEC.md Phase 6 section 38) -- DB-aggregated. */
export async function getPaymentMetrics(
  organizationId: string,
): Promise<{
  paymentsToday: string;
  paymentsThisMonth: string;
  succeededCount: number;
  failedCount: number;
  refundedCount: number;
  pendingReviewCount: number;
}> {
  const supabase = await getSupabaseServerClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  // Pending/processing online payments older than this are flagged for the
  // reconciliation view -- see app/(app)/payments/reconciliation-table.tsx.
  const staleThreshold = new Date(Date.now() - 30 * 60_000).toISOString();

  const [todayRes, monthRes, succeededRes, failedRes, refundedRes, staleRes] = await Promise.all([
    supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", organizationId)
      .eq("status", "succeeded")
      .gte("paid_at", startOfToday),
    supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", organizationId)
      .eq("status", "succeeded")
      .gte("paid_at", startOfMonth),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "succeeded")
      .gte("created_at", startOfMonth),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "failed")
      .gte("created_at", startOfMonth),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["refunded", "partially_refunded"])
      .gte("created_at", startOfMonth),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["pending", "processing"])
      .lt("created_at", staleThreshold),
  ]);

  const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + r.amount, 0);

  return {
    paymentsToday: sum(todayRes.data).toFixed(2),
    paymentsThisMonth: sum(monthRes.data).toFixed(2),
    succeededCount: succeededRes.count ?? 0,
    failedCount: failedRes.count ?? 0,
    refundedCount: refundedRes.count ?? 0,
    pendingReviewCount: staleRes.count ?? 0,
  };
}

/** Stale pending/processing online payments -- the reconciliation view (docs/PRODUCT_SPEC.md Phase 6 section 39). */
export async function listPaymentsNeedingReview(organizationId: string): Promise<PaymentRow[]> {
  const supabase = await getSupabaseServerClient();
  const staleThreshold = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["pending", "processing"])
    .lt("created_at", staleThreshold)
    .order("created_at");
  return (data ?? []).map((p) => mapPayment(p as unknown as RawPayment));
}
