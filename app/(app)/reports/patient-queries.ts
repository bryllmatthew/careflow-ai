import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ResolvedDateRange } from "@/lib/reporting/date-range";
import { buildTrendBuckets } from "@/lib/reporting/date-range";
import { safePercentChange, type PercentChange } from "@/lib/reporting/format";

export type PatientScope = { organizationId: string; clinicId?: string; range: ResolvedDateRange };

export type PatientSummary = {
  newPatients: number;
  previousNewPatients: number;
  newPatientsChange: PercentChange;
  totalActive: number;
  /**
   * Returning patients (section 12 -- "an operational/business metric," not
   * a clinical one): distinct patients with a COMPLETED appointment in the
   * selected period who also had at least one completed appointment BEFORE
   * the period started. A patient's first-ever visit, even if their second
   * appointment happens to also fall in this window, does not count twice
   * and is not "returning" until a prior visit exists before the window.
   */
  returningPatients: number;
  repeatAppointmentRate: number | null;
};

export async function getPatientSummary(scope: PatientScope): Promise<PatientSummary> {
  const supabase = await getSupabaseServerClient();
  const { organizationId, clinicId, range } = scope;
  const durationMs = new Date(range.endUtc).getTime() - new Date(range.startUtc).getTime();
  const prevStart = new Date(new Date(range.startUtc).getTime() - durationMs).toISOString();

  let newQ = supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", range.startUtc)
    .lt("created_at", range.endUtc);
  let prevNewQ = supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", prevStart)
    .lt("created_at", range.startUtc);
  let activeQ = supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "active");
  let periodAppointmentsQ = supabase
    .from("appointments")
    .select("patient_id, start_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .gte("start_at", range.startUtc)
    .lt("start_at", range.endUtc);

  if (clinicId) {
    newQ = newQ.eq("clinic_id", clinicId);
    prevNewQ = prevNewQ.eq("clinic_id", clinicId);
    activeQ = activeQ.eq("clinic_id", clinicId);
    periodAppointmentsQ = periodAppointmentsQ.eq("clinic_id", clinicId);
  }

  const [newRes, prevNewRes, activeRes, periodAppointmentsRes] = await Promise.all([
    newQ,
    prevNewQ,
    activeQ,
    periodAppointmentsQ,
  ]);

  const periodPatientIds = Array.from(
    new Set((periodAppointmentsRes.data ?? []).map((a) => a.patient_id)),
  );

  let returningPatients = 0;
  let repeatAppointments = 0;
  if (periodPatientIds.length > 0) {
    let priorQ = supabase
      .from("appointments")
      .select("patient_id")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .lt("start_at", range.startUtc)
      .in("patient_id", periodPatientIds);
    if (clinicId) priorQ = priorQ.eq("clinic_id", clinicId);
    const { data: priorRows } = await priorQ;
    const returningIds = new Set((priorRows ?? []).map((r) => r.patient_id));
    returningPatients = returningIds.size;
    repeatAppointments = (periodAppointmentsRes.data ?? []).filter((a) =>
      returningIds.has(a.patient_id),
    ).length;
  }

  const totalCompletedInPeriod = periodAppointmentsRes.data?.length ?? 0;

  return {
    newPatients: newRes.count ?? 0,
    previousNewPatients: prevNewRes.count ?? 0,
    newPatientsChange: safePercentChange(newRes.count ?? 0, prevNewRes.count ?? 0),
    totalActive: activeRes.count ?? 0,
    returningPatients,
    repeatAppointmentRate:
      totalCompletedInPeriod === 0 ? null : (repeatAppointments / totalCompletedInPeriod) * 100,
  };
}

export type PatientTrendPoint = { label: string; count: number };

export async function getNewPatientTrend(scope: PatientScope): Promise<PatientTrendPoint[]> {
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("patients")
    .select("created_at")
    .eq("organization_id", scope.organizationId)
    .gte("created_at", scope.range.startUtc)
    .lt("created_at", scope.range.endUtc);
  if (scope.clinicId) q = q.eq("clinic_id", scope.clinicId);
  const { data } = await q;

  const buckets = buildTrendBuckets(scope.range);
  return buckets.map((bucket) => {
    const start = new Date(bucket.startUtc).getTime();
    const end = new Date(bucket.endUtc).getTime();
    const count = (data ?? []).filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t >= start && t < end;
    }).length;
    return { label: bucket.label, count };
  });
}
