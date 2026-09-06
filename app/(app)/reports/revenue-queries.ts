import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ResolvedDateRange } from "@/lib/reporting/date-range";
import { buildTrendBuckets } from "@/lib/reporting/date-range";
import { safePercentChange, type PercentChange } from "@/lib/reporting/format";

export type RevenueScope = {
  organizationId: string;
  clinicId?: string;
  range: ResolvedDateRange;
};

/**
 * The four authoritative revenue figures (section 7) -- never a re-derived
 * sum of invoice totals when "collected" is meant. Each comes from exactly
 * one source table:
 *
 *   Invoiced      = sum(invoices.total)   where status not in (draft, void, cancelled), issue_date in range
 *   Collected     = sum(payments.amount)  where status = 'succeeded', paid_at in range
 *   Refunded      = sum(refunds.amount)   where status = 'succeeded', completed_at in range
 *   Net Collected = Collected - Refunded
 *   Outstanding   = sum(invoices.balance) where status in (issued, overdue, partially_paid) -- CURRENT
 *                   state, not filtered by the selected range: it is money owed right now, not
 *                   money that became owed within a window. Selecting "Last Month" does not
 *                   change what is currently outstanding.
 */
export async function getRevenueSummary(scope: RevenueScope): Promise<{
  invoiced: string;
  collected: string;
  refunded: string;
  netCollected: string;
  outstanding: string;
  previousCollected: string;
  collectedChange: PercentChange;
}> {
  const supabase = await getSupabaseServerClient();
  const { organizationId, clinicId, range } = scope;
  const durationMs = new Date(range.endUtc).getTime() - new Date(range.startUtc).getTime();
  const prevStart = new Date(new Date(range.startUtc).getTime() - durationMs).toISOString();

  let invoicedQ = supabase
    .from("invoices")
    .select("total")
    .eq("organization_id", organizationId)
    .not("status", "in", "(draft,void,cancelled)")
    .gte("issue_date", range.startUtc.slice(0, 10))
    .lt("issue_date", range.endUtc.slice(0, 10));
  let collectedQ = supabase
    .from("payments")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("status", "succeeded")
    .gte("paid_at", range.startUtc)
    .lt("paid_at", range.endUtc);
  let previousCollectedQ = supabase
    .from("payments")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("status", "succeeded")
    .gte("paid_at", prevStart)
    .lt("paid_at", range.startUtc);
  let refundedQ = supabase
    .from("refunds")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("status", "succeeded")
    .gte("completed_at", range.startUtc)
    .lt("completed_at", range.endUtc);
  let outstandingQ = supabase
    .from("invoices")
    .select("balance")
    .eq("organization_id", organizationId)
    .in("status", ["issued", "overdue", "partially_paid"]);

  if (clinicId) {
    invoicedQ = invoicedQ.eq("clinic_id", clinicId);
    collectedQ = collectedQ.eq("clinic_id", clinicId);
    previousCollectedQ = previousCollectedQ.eq("clinic_id", clinicId);
    refundedQ = refundedQ.eq("clinic_id", clinicId);
    outstandingQ = outstandingQ.eq("clinic_id", clinicId);
  }

  const [invoicedRes, collectedRes, previousCollectedRes, refundedRes, outstandingRes] =
    await Promise.all([invoicedQ, collectedQ, previousCollectedQ, refundedQ, outstandingQ]);

  const sum = (rows: Record<string, number | null>[] | null, key: string) =>
    (rows ?? []).reduce((s, r) => s + (r[key] ?? 0), 0);

  const invoiced = sum(invoicedRes.data, "total");
  const collected = sum(collectedRes.data, "amount");
  const previousCollected = sum(previousCollectedRes.data, "amount");
  const refunded = sum(refundedRes.data, "amount");
  const outstanding = sum(outstandingRes.data, "balance");

  return {
    invoiced: invoiced.toFixed(2),
    collected: collected.toFixed(2),
    refunded: refunded.toFixed(2),
    netCollected: (collected - refunded).toFixed(2),
    outstanding: outstanding.toFixed(2),
    previousCollected: previousCollected.toFixed(2),
    collectedChange: safePercentChange(collected, previousCollected),
  };
}

export type RevenueTrendPoint = { label: string; collected: number; invoiced: number };

/** Bucketed collected/invoiced revenue for the trend chart (section 30). Granularity auto-adjusts to the range span (section 10). */
export async function getRevenueTrend(scope: RevenueScope): Promise<RevenueTrendPoint[]> {
  const supabase = await getSupabaseServerClient();
  const { organizationId, clinicId, range } = scope;
  const buckets = buildTrendBuckets(range);

  let paymentsQ = supabase
    .from("payments")
    .select("amount, paid_at")
    .eq("organization_id", organizationId)
    .eq("status", "succeeded")
    .gte("paid_at", range.startUtc)
    .lt("paid_at", range.endUtc);
  let invoicesQ = supabase
    .from("invoices")
    .select("total, issue_date")
    .eq("organization_id", organizationId)
    .not("status", "in", "(draft,void,cancelled)")
    .gte("issue_date", range.startUtc.slice(0, 10))
    .lt("issue_date", range.endUtc.slice(0, 10));

  if (clinicId) {
    paymentsQ = paymentsQ.eq("clinic_id", clinicId);
    invoicesQ = invoicesQ.eq("clinic_id", clinicId);
  }

  const [{ data: payments }, { data: invoices }] = await Promise.all([paymentsQ, invoicesQ]);

  return buckets.map((bucket) => {
    const bucketStart = new Date(bucket.startUtc).getTime();
    const bucketEnd = new Date(bucket.endUtc).getTime();
    const collected = (payments ?? [])
      .filter((p) => {
        const t = new Date(p.paid_at!).getTime();
        return t >= bucketStart && t < bucketEnd;
      })
      .reduce((s, p) => s + p.amount, 0);
    const invoiced = (invoices ?? [])
      .filter((i) => {
        const t = new Date(i.issue_date!).getTime();
        return t >= bucketStart && t < bucketEnd;
      })
      .reduce((s, i) => s + i.total, 0);
    return { label: bucket.label, collected, invoiced };
  });
}

export type RevenueByClinicRow = {
  clinicId: string;
  clinicName: string;
  invoiced: string;
  collected: string;
};

export async function getRevenueByClinic(
  organizationId: string,
  range: ResolvedDateRange,
  clinics: { id: string; name: string }[],
): Promise<RevenueByClinicRow[]> {
  const supabase = await getSupabaseServerClient();

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("total, clinic_id")
      .eq("organization_id", organizationId)
      .not("status", "in", "(draft,void,cancelled)")
      .gte("issue_date", range.startUtc.slice(0, 10))
      .lt("issue_date", range.endUtc.slice(0, 10)),
    supabase
      .from("payments")
      .select("amount, clinic_id")
      .eq("organization_id", organizationId)
      .eq("status", "succeeded")
      .gte("paid_at", range.startUtc)
      .lt("paid_at", range.endUtc),
  ]);

  return clinics.map((c) => ({
    clinicId: c.id,
    clinicName: c.name,
    invoiced: (invoices ?? [])
      .filter((i) => i.clinic_id === c.id)
      .reduce((s, i) => s + i.total, 0)
      .toFixed(2),
    collected: (payments ?? [])
      .filter((p) => p.clinic_id === c.id)
      .reduce((s, p) => s + p.amount, 0)
      .toFixed(2),
  }));
}

export type PaymentMethodRow = { method: string; count: number; amount: string };

export async function getRevenueByPaymentMethod(scope: RevenueScope): Promise<PaymentMethodRow[]> {
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("payments")
    .select("payment_method, amount")
    .eq("organization_id", scope.organizationId)
    .eq("status", "succeeded")
    .gte("paid_at", scope.range.startUtc)
    .lt("paid_at", scope.range.endUtc);
  if (scope.clinicId) q = q.eq("clinic_id", scope.clinicId);

  const { data } = await q;
  const byMethod = new Map<string, { count: number; amount: number }>();
  for (const p of data ?? []) {
    const entry = byMethod.get(p.payment_method) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += p.amount;
    byMethod.set(p.payment_method, entry);
  }
  return Array.from(byMethod.entries())
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount.toFixed(2) }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));
}

export type InvoiceStatusRow = { status: string; count: number; total: string };

export async function getInvoiceStatusBreakdown(scope: RevenueScope): Promise<InvoiceStatusRow[]> {
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("invoices")
    .select("status, total")
    .eq("organization_id", scope.organizationId);
  if (scope.clinicId) q = q.eq("clinic_id", scope.clinicId);

  const { data } = await q;
  const byStatus = new Map<string, { count: number; total: number }>();
  for (const inv of data ?? []) {
    const entry = byStatus.get(inv.status) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += inv.total;
    byStatus.set(inv.status, entry);
  }
  return Array.from(byStatus.entries()).map(([status, v]) => ({
    status,
    count: v.count,
    total: v.total.toFixed(2),
  }));
}

export type PaymentPerformanceSummary = {
  succeededCount: number;
  failedCount: number;
  pendingCount: number;
  refundedCount: number;
  succeededAmount: string;
};

/** Section 21 -- payment analytics. Failure is reported as a count, never re-labeled "lost revenue" (a failed payment was never revenue). */
export async function getPaymentPerformance(
  scope: RevenueScope,
): Promise<PaymentPerformanceSummary> {
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("payments")
    .select("status, amount")
    .eq("organization_id", scope.organizationId)
    .gte("created_at", scope.range.startUtc)
    .lt("created_at", scope.range.endUtc);
  if (scope.clinicId) q = q.eq("clinic_id", scope.clinicId);

  const { data } = await q;
  const rows = data ?? [];
  return {
    succeededCount: rows.filter((r) => r.status === "succeeded").length,
    failedCount: rows.filter((r) => r.status === "failed").length,
    pendingCount: rows.filter((r) => r.status === "pending" || r.status === "processing").length,
    refundedCount: rows.filter((r) => r.status === "refunded" || r.status === "partially_refunded")
      .length,
    succeededAmount: rows
      .filter((r) => r.status === "succeeded")
      .reduce((s, r) => s + r.amount, 0)
      .toFixed(2),
  };
}
