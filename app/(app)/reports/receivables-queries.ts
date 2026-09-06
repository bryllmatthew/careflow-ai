import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { type AgingBucket, agingBucketLabels } from "@/lib/reporting/receivables";

export { type AgingBucket, agingBucketLabels };

export const RECEIVABLES_PAGE_SIZE = 25;

export type ReceivableRow = {
  invoiceId: string;
  invoiceNumber: string | null;
  patientId: string;
  patientName: string;
  clinicName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: string;
  paid: string;
  balance: string;
  status: string;
  daysOverdue: number;
  agingBucket: AgingBucket;
};

/**
 * supabase-js's select-string type inference can't resolve this nested
 * embed (same limitation worked around in Phase 5-7's own queries.ts
 * files) -- the query itself is fine at runtime, only the compile-time
 * inference gives up on the 2-level-deep embed.
 */
type RawReceivable = {
  id: string;
  invoice_number: string | null;
  patient_id: string;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  amount_paid: number;
  balance: number | null;
  status: string;
  patients: { first_name: string; last_name: string } | null;
  clinics: { name: string } | null;
};

function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1_30";
  if (daysOverdue <= 60) return "31_60";
  if (daysOverdue <= 90) return "61_90";
  return "90_plus";
}

/**
 * Section 20 -- the accounts-receivable view. `daysOverdue` is computed
 * against the invoice's `due_date`; an invoice with no due date is treated
 * as never overdue (bucket "current") since there is no date to measure
 * against. Patient-level financial data here is gated the same as anywhere
 * else in the app -- RLS on `invoices`/`patients`, not a separate rule.
 */
export async function getReceivablesReport(
  organizationId: string,
  filters: { clinicId?: string; agingBucket?: AgingBucket; page?: number },
): Promise<{ rows: ReceivableRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * RECEIVABLES_PAGE_SIZE;
  const to = from + RECEIVABLES_PAGE_SIZE - 1;

  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, patient_id, issue_date, due_date, total, amount_paid, balance, status, " +
        "patients(first_name, last_name), clinics(name)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .in("status", ["issued", "overdue", "partially_paid"])
    .gt("balance", 0);

  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);

  // Bucket boundaries applied at the query level (not post-fetch) so
  // pagination and `total` stay accurate for a filtered bucket -- these are
  // plain date-string comparisons against `due_date`, computed once here.
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  if (filters.agingBucket === "current") {
    query = query.or(`due_date.is.null,due_date.gte.${today}`);
  } else if (filters.agingBucket === "1_30") {
    query = query.gte("due_date", daysAgo(30)).lt("due_date", today);
  } else if (filters.agingBucket === "31_60") {
    query = query.gte("due_date", daysAgo(60)).lt("due_date", daysAgo(30));
  } else if (filters.agingBucket === "61_90") {
    query = query.gte("due_date", daysAgo(90)).lt("due_date", daysAgo(60));
  } else if (filters.agingBucket === "90_plus") {
    query = query.lt("due_date", daysAgo(90));
  }

  const { data, count } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .range(from, to);

  const todayMs = new Date(new Date().toDateString()).getTime();

  const rows: ReceivableRow[] = ((data ?? []) as unknown as RawReceivable[]).map((inv) => {
    const daysOverdue = inv.due_date
      ? Math.max(0, Math.floor((todayMs - new Date(inv.due_date).getTime()) / 86_400_000))
      : 0;
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      patientId: inv.patient_id,
      patientName: inv.patients
        ? `${inv.patients.first_name} ${inv.patients.last_name}`
        : "Unknown",
      clinicName: inv.clinics?.name ?? null,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      total: inv.total.toFixed(2),
      paid: inv.amount_paid.toFixed(2),
      balance: (inv.balance ?? 0).toFixed(2),
      status: inv.status,
      daysOverdue,
      agingBucket: bucketFor(daysOverdue),
    };
  });

  return { rows, total: count ?? 0 };
}
