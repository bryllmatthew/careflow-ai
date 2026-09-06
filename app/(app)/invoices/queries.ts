import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/validation/invoice.schema";

export const INVOICES_PAGE_SIZE = 20;

const INVOICE_SELECT =
  "id, invoice_number, status, issue_date, due_date, subtotal, discount_type, discount_value, " +
  "discount_amount, tax_rate, tax_amount, total, amount_paid, balance, currency, notes, " +
  "void_reason, voided_at, created_at, clinic_id, clinics(name), " +
  "patient_id, patients(first_name, last_name), appointment_id";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  discountType: string | null;
  discountValue: string | null;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  balance: string;
  currency: string;
  notes: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
  clinicId: string;
  clinicName: string | null;
  patientId: string;
  patientName: string;
  appointmentId: string | null;
  /** True when issued, has an outstanding balance, and its due date has passed -- see docs comment below. */
  isOverdue: boolean;
};

type RawInvoice = {
  id: string;
  invoice_number: string | null;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  discount_type: string | null;
  discount_value: number | null;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance: number;
  currency: string;
  notes: string | null;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  clinic_id: string;
  clinics: { name: string } | null;
  patient_id: string;
  patients: { first_name: string; last_name: string } | null;
  appointment_id: string | null;
};

/**
 * "Overdue" is never a status a client sets directly -- it's computed here
 * from status/due_date/balance (docs/PRODUCT_SPEC.md Phase 5 section 35),
 * so it can never drift out of sync the way a manually-toggled status could.
 * The stored 'overdue' status value exists for the one place that DOES need
 * to persist it: app/api/cron/check-overdue-invoices, so the automation
 * event fires exactly once per invoice (see that route).
 */
function isOverdue(status: string, dueDate: string | null, balance: number): boolean {
  if (status !== "issued" && status !== "overdue") return false;
  if (!dueDate || balance <= 0) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function mapInvoice(i: RawInvoice): InvoiceRow {
  return {
    id: i.id,
    invoiceNumber: i.invoice_number,
    status: i.status,
    issueDate: i.issue_date,
    dueDate: i.due_date,
    subtotal: i.subtotal.toFixed(2),
    discountType: i.discount_type,
    discountValue: i.discount_value === null ? null : i.discount_value.toFixed(2),
    discountAmount: i.discount_amount.toFixed(2),
    taxRate: i.tax_rate.toFixed(2),
    taxAmount: i.tax_amount.toFixed(2),
    total: i.total.toFixed(2),
    amountPaid: i.amount_paid.toFixed(2),
    balance: i.balance.toFixed(2),
    currency: i.currency,
    notes: i.notes,
    voidReason: i.void_reason,
    voidedAt: i.voided_at,
    createdAt: i.created_at,
    clinicId: i.clinic_id,
    clinicName: i.clinics?.name ?? null,
    patientId: i.patient_id,
    patientName: i.patients ? `${i.patients.first_name} ${i.patients.last_name}` : "Unknown",
    appointmentId: i.appointment_id,
    isOverdue: isOverdue(i.status, i.due_date, i.balance),
  };
}

export type InvoiceListFilters = {
  q?: string;
  clinicId?: string;
  status?: InvoiceStatus | "all" | "overdue";
  patientId?: string;
  page?: number;
};

export async function listInvoices(
  organizationId: string,
  filters: InvoiceListFilters,
): Promise<{ rows: InvoiceRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * INVOICES_PAGE_SIZE;
  const to = from + INVOICES_PAGE_SIZE - 1;

  let query = supabase
    .from("invoices")
    .select(INVOICE_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.patientId) query = query.eq("patient_id", filters.patientId);

  if (filters.status === "overdue") {
    query = query
      .eq("status", "issued")
      .lt("due_date", new Date().toISOString().slice(0, 10))
      .gt("balance", 0);
  } else if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  // Invoice number and patient name search -- two separate parameterized
  // lookups merged into an .in(), not a raw .or() string: PostgREST doesn't
  // escape interpolated values in .or(), so free-text containing a comma or
  // parenthesis could otherwise break the filter (same reasoning as
  // patients' duplicate search, app/(app)/patients/actions.ts).
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    const [byNumber, matchingPatients] = await Promise.all([
      supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("invoice_number", `%${q}%`),
      supabase
        .from("patients")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("search_text", `%${q.toLowerCase()}%`),
    ]);
    const patientIds = (matchingPatients.data ?? []).map((p) => p.id);
    const byPatient =
      patientIds.length > 0
        ? await supabase
            .from("invoices")
            .select("id")
            .eq("organization_id", organizationId)
            .in("patient_id", patientIds)
        : { data: [] as { id: string }[] };

    const matchedIds = new Set([
      ...(byNumber.data ?? []).map((r) => r.id),
      ...(byPatient.data ?? []).map((r) => r.id),
    ]);
    if (matchedIds.size === 0) return { rows: [], total: 0 };
    query = query.in("id", Array.from(matchedIds));
  }

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);

  return {
    rows: (data ?? []).map((i) => mapInvoice(i as unknown as RawInvoice)),
    total: count ?? 0,
  };
}

export type InvoiceItemRow = {
  id: string;
  serviceId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

export type InvoiceDetail = InvoiceRow & {
  createdBy: string | null;
  items: InvoiceItemRow[];
};

export async function getInvoiceById(invoiceId: string): Promise<InvoiceDetail | null> {
  const supabase = await getSupabaseServerClient();
  const [{ data: invoice }, { data: items }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`${INVOICE_SELECT}, created_by`)
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase
      .from("invoice_items")
      .select("id, service_id, description, quantity, unit_price, line_total")
      .eq("invoice_id", invoiceId)
      .order("created_at"),
  ]);

  if (!invoice) return null;

  return {
    ...mapInvoice(invoice as unknown as RawInvoice),
    createdBy: (invoice as { created_by: string | null }).created_by,
    items: (items ?? []).map((it) => ({
      id: it.id,
      serviceId: it.service_id,
      description: it.description,
      quantity: String(it.quantity),
      unitPrice: it.unit_price.toFixed(2),
      lineTotal: (it.line_total ?? 0).toFixed(2),
    })),
  };
}

/** For the patient profile's financial section. */
export async function listPatientInvoices(patientId: string): Promise<InvoiceRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((i) => mapInvoice(i as unknown as RawInvoice));
}

export async function getPatientOutstandingBalance(patientId: string): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select("balance")
    .eq("patient_id", patientId)
    .in("status", ["issued", "overdue", "partially_paid"]);

  const total = (data ?? []).reduce((sum, row) => sum + (row.balance ?? 0), 0);
  return total.toFixed(2);
}

/** For the dashboard and Sales module (docs/PRODUCT_SPEC.md Phase 5 sections 19/26) -- DB-aggregated, never loaded row-by-row into the browser. */
export async function getSalesMetrics(organizationId: string): Promise<{
  salesToday: string;
  salesThisMonth: string;
  outstanding: string;
  overdueCount: number;
  paidCount: number;
  voidedCount: number;
}> {
  const supabase = await getSupabaseServerClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    .toISOString()
    .slice(0, 10);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [todayRes, monthRes, outstandingRes, overdueRes, voidedRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("total")
      .eq("organization_id", organizationId)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .neq("status", "void")
      .gte("issue_date", startOfToday),
    supabase
      .from("invoices")
      .select("total")
      .eq("organization_id", organizationId)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .neq("status", "void")
      .gte("issue_date", startOfMonth),
    supabase
      .from("invoices")
      .select("balance")
      .eq("organization_id", organizationId)
      .in("status", ["issued", "overdue", "partially_paid"]),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "issued")
      .lt("due_date", today)
      .gt("balance", 0),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "void"),
  ]);

  const sum = (rows: { total: number }[] | null) => (rows ?? []).reduce((s, r) => s + r.total, 0);
  const outstanding = (outstandingRes.data ?? []).reduce((s, r) => s + (r.balance ?? 0), 0);
  const paidCount = 0; // no payment recording yet (Phase 6) -- never claim a paid count that can't exist.

  return {
    salesToday: sum(todayRes.data).toFixed(2),
    salesThisMonth: sum(monthRes.data).toFixed(2),
    outstanding: outstanding.toFixed(2),
    overdueCount: overdueRes.count ?? 0,
    paidCount,
    voidedCount: voidedRes.count ?? 0,
  };
}
