import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ResolvedDateRange } from "@/lib/reporting/date-range";

const INVOICED_STATUSES = ["issued", "partially_paid", "paid", "overdue"];
const ELIGIBLE_STATUSES = ["completed", "cancelled", "no_show"];

type BaseScope = { organizationId: string; range: ResolvedDateRange };

export type ClinicPerformanceRow = {
  clinicId: string;
  clinicName: string;
  revenue: string;
  appointments: number;
  completed: number;
  noShow: number;
  cancellationRate: number | null;
  newPatients: number;
  outstanding: string;
  lowStockCount: number;
};

/**
 * One row per authorized clinic (section 13). `clinics` is already
 * RLS-filtered to what the caller can see (context.ts) -- a clinic this
 * user cannot access never appears as a row here, and every underlying
 * query below is itself RLS-bounded regardless, so there is no path for an
 * unauthorized clinic's numbers to leak into another clinic's row or into a
 * combined total (section 38).
 */
export async function getClinicPerformance(
  scope: BaseScope,
  clinics: { id: string; name: string }[],
): Promise<ClinicPerformanceRow[]> {
  const supabase = await getSupabaseServerClient();
  const { organizationId, range } = scope;

  const [invoicesRes, appointmentsRes, patientsRes, outstandingRes, inventoryRes] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("total, clinic_id")
        .eq("organization_id", organizationId)
        .in("status", INVOICED_STATUSES)
        .gte("issue_date", range.startUtc.slice(0, 10))
        .lt("issue_date", range.endUtc.slice(0, 10)),
      supabase
        .from("appointments")
        .select("status, clinic_id")
        .eq("organization_id", organizationId)
        .gte("start_at", range.startUtc)
        .lt("start_at", range.endUtc),
      supabase
        .from("patients")
        .select("id, clinic_id")
        .eq("organization_id", organizationId)
        .gte("created_at", range.startUtc)
        .lt("created_at", range.endUtc),
      supabase
        .from("invoices")
        .select("balance, clinic_id")
        .eq("organization_id", organizationId)
        .in("status", ["issued", "overdue", "partially_paid"]),
      supabase
        .from("inventory")
        .select("id, clinic_id")
        .eq("organization_id", organizationId)
        .eq("is_low_stock", true),
    ]);

  return clinics.map((c) => {
    const appts = (appointmentsRes.data ?? []).filter((a) => a.clinic_id === c.id);
    const eligible = appts.filter((a) => ELIGIBLE_STATUSES.includes(a.status));
    const cancelled = appts.filter((a) => a.status === "cancelled").length;

    return {
      clinicId: c.id,
      clinicName: c.name,
      revenue: (invoicesRes.data ?? [])
        .filter((i) => i.clinic_id === c.id)
        .reduce((s, i) => s + i.total, 0)
        .toFixed(2),
      appointments: appts.length,
      completed: appts.filter((a) => a.status === "completed").length,
      noShow: appts.filter((a) => a.status === "no_show").length,
      cancellationRate: eligible.length === 0 ? null : (cancelled / eligible.length) * 100,
      newPatients: (patientsRes.data ?? []).filter((p) => p.clinic_id === c.id).length,
      outstanding: (outstandingRes.data ?? [])
        .filter((i) => i.clinic_id === c.id)
        .reduce((s, i) => s + (i.balance ?? 0), 0)
        .toFixed(2),
      lowStockCount: (inventoryRes.data ?? []).filter((i) => i.clinic_id === c.id).length,
    };
  });
}

export type ServicePerformanceRow = {
  serviceId: string;
  serviceName: string;
  appointments: number;
  completed: number;
  cancelled: number;
  noShow: number;
  /** Invoiced value of line items tied to this service (docs/modules/REPORTING.md -- payments settle whole invoices, not individual lines, so this is not "collected revenue by service"). */
  revenue: string;
  avgRevenuePerCompleted: string | null;
};

export async function getServicePerformance(
  scope: BaseScope,
  clinicId?: string,
): Promise<ServicePerformanceRow[]> {
  const supabase = await getSupabaseServerClient();
  const { organizationId, range } = scope;

  let servicesQ = supabase
    .from("services")
    .select("id, name")
    .eq("organization_id", organizationId);
  let apptQ = supabase
    .from("appointments")
    .select("service_id, status")
    .eq("organization_id", organizationId)
    .gte("start_at", range.startUtc)
    .lt("start_at", range.endUtc);
  let itemsQ = supabase
    .from("invoice_items")
    .select("line_total, service_id, invoices!inner(issue_date, status, organization_id)")
    .eq("organization_id", organizationId)
    .not("service_id", "is", null);

  if (clinicId) {
    servicesQ = servicesQ.eq("clinic_id", clinicId);
    apptQ = apptQ.eq("clinic_id", clinicId);
    itemsQ = itemsQ.eq("clinic_id", clinicId);
  }

  const [{ data: services }, { data: appointments }, { data: items }] = await Promise.all([
    servicesQ,
    apptQ,
    itemsQ,
  ]);

  const rangeStartMs = new Date(range.startUtc).getTime();
  const rangeEndMs = new Date(range.endUtc).getTime();
  const relevantItems = (items ?? []).filter((i) => {
    const inv = i.invoices as unknown as { issue_date: string | null; status: string } | null;
    if (!inv || !inv.issue_date || !INVOICED_STATUSES.includes(inv.status)) return false;
    const t = new Date(inv.issue_date).getTime();
    return t >= rangeStartMs && t < rangeEndMs;
  });

  return (services ?? [])
    .map((svc) => {
      const appts = (appointments ?? []).filter((a) => a.service_id === svc.id);
      const completed = appts.filter((a) => a.status === "completed").length;
      const revenue = relevantItems
        .filter((i) => i.service_id === svc.id)
        .reduce((s, i) => s + (i.line_total ?? 0), 0);
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        appointments: appts.length,
        completed,
        cancelled: appts.filter((a) => a.status === "cancelled").length,
        noShow: appts.filter((a) => a.status === "no_show").length,
        revenue: revenue.toFixed(2),
        avgRevenuePerCompleted: completed === 0 ? null : (revenue / completed).toFixed(2),
      };
    })
    .filter((row) => row.appointments > 0 || Number(row.revenue) > 0);
}

export type PractitionerPerformanceRow = {
  practitionerId: string;
  practitionerName: string;
  appointments: number;
  completed: number;
  cancelled: number;
  noShow: number;
  patientCount: number;
  /** Only from invoices explicitly linked to one of this practitioner's appointments (invoices.appointment_id) -- never a guessed split of unattributed revenue (section 16). */
  attributedRevenue: string;
  followUpsAssigned: number;
  followUpsCompleted: number;
};

export async function getPractitionerPerformance(
  scope: BaseScope,
  clinicId?: string,
): Promise<PractitionerPerformanceRow[]> {
  const supabase = await getSupabaseServerClient();
  const { organizationId, range } = scope;

  let apptQ = supabase
    .from("appointments")
    .select("id, staff_id, status, patient_id, profiles:staff_id(full_name, email)")
    .eq("organization_id", organizationId)
    .gte("start_at", range.startUtc)
    .lt("start_at", range.endUtc);
  let invoicesQ = supabase
    .from("invoices")
    .select("total, appointment_id, appointments!inner(staff_id, organization_id)")
    .eq("organization_id", organizationId)
    .in("status", INVOICED_STATUSES)
    .not("appointment_id", "is", null)
    .gte("issue_date", range.startUtc.slice(0, 10))
    .lt("issue_date", range.endUtc.slice(0, 10));
  let followUpsQ = supabase
    .from("follow_ups")
    .select("assigned_to, status")
    .eq("organization_id", organizationId)
    .not("assigned_to", "is", null)
    .gte("created_at", range.startUtc)
    .lt("created_at", range.endUtc);

  if (clinicId) {
    apptQ = apptQ.eq("clinic_id", clinicId);
    invoicesQ = invoicesQ.eq("clinic_id", clinicId);
    followUpsQ = followUpsQ.eq("clinic_id", clinicId);
  }

  const [{ data: appointments }, { data: invoices }, { data: followUps }] = await Promise.all([
    apptQ,
    invoicesQ,
    followUpsQ,
  ]);

  type RawAppt = {
    id: string;
    staff_id: string;
    status: string;
    patient_id: string;
    profiles: { full_name: string | null; email: string | null } | null;
  };
  const rows = (appointments ?? []) as unknown as RawAppt[];

  const byStaff = new Map<string, { name: string; appts: RawAppt[] }>();
  for (const a of rows) {
    const entry = byStaff.get(a.staff_id) ?? {
      name: a.profiles?.full_name ?? a.profiles?.email ?? "Unknown",
      appts: [],
    };
    entry.appts.push(a);
    byStaff.set(a.staff_id, entry);
  }

  return Array.from(byStaff.entries()).map(([staffId, { name, appts }]) => {
    const revenue = (invoices ?? [])
      .filter((i) => (i.appointments as unknown as { staff_id: string }).staff_id === staffId)
      .reduce((s, i) => s + i.total, 0);
    const assigned = (followUps ?? []).filter((f) => f.assigned_to === staffId);
    return {
      practitionerId: staffId,
      practitionerName: name,
      appointments: appts.length,
      completed: appts.filter((a) => a.status === "completed").length,
      cancelled: appts.filter((a) => a.status === "cancelled").length,
      noShow: appts.filter((a) => a.status === "no_show").length,
      patientCount: new Set(appts.map((a) => a.patient_id)).size,
      attributedRevenue: revenue.toFixed(2),
      followUpsAssigned: assigned.length,
      followUpsCompleted: assigned.filter((f) => f.status === "completed").length,
    };
  });
}
