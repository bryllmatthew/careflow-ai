import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ResolvedDateRange } from "@/lib/reporting/date-range";
import { buildTrendBuckets } from "@/lib/reporting/date-range";
import { safePercentChange, type PercentChange } from "@/lib/reporting/format";

export type AppointmentScope = {
  organizationId: string;
  clinicId?: string;
  practitionerId?: string;
  serviceId?: string;
  range: ResolvedDateRange;
};

const APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;

/**
 * "Eligible appointments" (section 9) -- the ONE definition every rate in
 * this app uses, dashboard and report alike: appointments that reached a
 * concluded outcome. `pending`/`confirmed`/`checked_in`/`in_progress`
 * appointments haven't happened yet, so including them in a rate's
 * denominator would understate every rate for a still-in-progress period
 * (e.g. "today" at 9am). See docs/modules/REPORTING.md.
 */
const ELIGIBLE_STATUSES = ["completed", "cancelled", "no_show"] as const;

async function fetchAppointmentStatuses(
  scope: AppointmentScope,
): Promise<{ status: string; staff_id: string; patient_id: string }[]> {
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("appointments")
    .select("status, staff_id, patient_id")
    .eq("organization_id", scope.organizationId)
    .gte("start_at", scope.range.startUtc)
    .lt("start_at", scope.range.endUtc);
  if (scope.clinicId) q = q.eq("clinic_id", scope.clinicId);
  if (scope.practitionerId) q = q.eq("staff_id", scope.practitionerId);
  if (scope.serviceId) q = q.eq("service_id", scope.serviceId);
  const { data } = await q;
  return data ?? [];
}

export type AppointmentSummary = {
  total: number;
  byStatus: Record<string, number>;
  eligible: number;
  completionRate: number | null;
  noShowRate: number | null;
  cancellationRate: number | null;
  previousTotal: number;
  totalChange: PercentChange;
};

export async function getAppointmentSummary(scope: AppointmentScope): Promise<AppointmentSummary> {
  const durationMs =
    new Date(scope.range.endUtc).getTime() - new Date(scope.range.startUtc).getTime();
  const supabase = await getSupabaseServerClient();

  const rows = await fetchAppointmentStatuses(scope);

  let prevQ = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .gte("start_at", new Date(new Date(scope.range.startUtc).getTime() - durationMs).toISOString())
    .lt("start_at", scope.range.startUtc);
  if (scope.clinicId) prevQ = prevQ.eq("clinic_id", scope.clinicId);
  if (scope.practitionerId) prevQ = prevQ.eq("staff_id", scope.practitionerId);
  if (scope.serviceId) prevQ = prevQ.eq("service_id", scope.serviceId);
  const { count: previousTotal } = await prevQ;

  const byStatus: Record<string, number> = {};
  for (const s of APPOINTMENT_STATUSES) byStatus[s] = 0;
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  const eligible = ELIGIBLE_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  const rate = (count: number) => (eligible === 0 ? null : (count / eligible) * 100);

  return {
    total: rows.length,
    byStatus,
    eligible,
    completionRate: rate(byStatus.completed ?? 0),
    noShowRate: rate(byStatus.no_show ?? 0),
    cancellationRate: rate(byStatus.cancelled ?? 0),
    previousTotal: previousTotal ?? 0,
    totalChange: safePercentChange(rows.length, previousTotal ?? 0),
  };
}

export type AppointmentTrendPoint = {
  label: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

export async function getAppointmentTrend(
  scope: AppointmentScope,
): Promise<AppointmentTrendPoint[]> {
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("appointments")
    .select("status, start_at")
    .eq("organization_id", scope.organizationId)
    .gte("start_at", scope.range.startUtc)
    .lt("start_at", scope.range.endUtc);
  if (scope.clinicId) q = q.eq("clinic_id", scope.clinicId);
  if (scope.practitionerId) q = q.eq("staff_id", scope.practitionerId);
  if (scope.serviceId) q = q.eq("service_id", scope.serviceId);
  const { data } = await q;

  const buckets = buildTrendBuckets(scope.range);
  return buckets.map((bucket) => {
    const start = new Date(bucket.startUtc).getTime();
    const end = new Date(bucket.endUtc).getTime();
    const inBucket = (data ?? []).filter((a) => {
      const t = new Date(a.start_at).getTime();
      return t >= start && t < end;
    });
    return {
      label: bucket.label,
      total: inBucket.length,
      completed: inBucket.filter((a) => a.status === "completed").length,
      cancelled: inBucket.filter((a) => a.status === "cancelled").length,
      noShow: inBucket.filter((a) => a.status === "no_show").length,
    };
  });
}
