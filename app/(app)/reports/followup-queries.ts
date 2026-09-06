import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ResolvedDateRange } from "@/lib/reporting/date-range";

type Scope = { organizationId: string; clinicId?: string; range: ResolvedDateRange };

export type FollowUpReport = {
  /** Always current-state, never date-ranged -- "overdue" and "due today" describe right now, not a selected window. */
  overdue: number;
  dueToday: number;
  upcoming: number;
  /** These four ARE range-bound, from `created_at`/`completed_at` within the selected period. */
  createdInRange: number;
  completedInRange: number;
  cancelledInRange: number;
  completionRate: number | null;
};

export async function getFollowUpReport(scope: Scope): Promise<FollowUpReport> {
  const supabase = await getSupabaseServerClient();
  const now = new Date().toISOString();
  const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const todayEnd = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();

  let overdueQ = supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .lt("due_at", now)
    .in("status", ["pending", "in_progress"]);
  let dueTodayQ = supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .gte("due_at", todayStart)
    .lte("due_at", todayEnd)
    .in("status", ["pending", "in_progress"]);
  let upcomingQ = supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .gt("due_at", todayEnd)
    .lte("due_at", in7Days)
    .in("status", ["pending", "in_progress"]);
  let createdQ = supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .gte("created_at", scope.range.startUtc)
    .lt("created_at", scope.range.endUtc);
  let completedQ = supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .eq("status", "completed")
    .gte("completed_at", scope.range.startUtc)
    .lt("completed_at", scope.range.endUtc);
  let cancelledQ = supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .eq("status", "cancelled")
    .gte("updated_at", scope.range.startUtc)
    .lt("updated_at", scope.range.endUtc);

  if (scope.clinicId) {
    overdueQ = overdueQ.eq("clinic_id", scope.clinicId);
    dueTodayQ = dueTodayQ.eq("clinic_id", scope.clinicId);
    upcomingQ = upcomingQ.eq("clinic_id", scope.clinicId);
    createdQ = createdQ.eq("clinic_id", scope.clinicId);
    completedQ = completedQ.eq("clinic_id", scope.clinicId);
    cancelledQ = cancelledQ.eq("clinic_id", scope.clinicId);
  }

  const [overdueRes, dueTodayRes, upcomingRes, createdRes, completedRes, cancelledRes] =
    await Promise.all([overdueQ, dueTodayQ, upcomingQ, createdQ, completedQ, cancelledQ]);

  const completed = completedRes.count ?? 0;
  const cancelled = cancelledRes.count ?? 0;
  const concluded = completed + cancelled;

  return {
    overdue: overdueRes.count ?? 0,
    dueToday: dueTodayRes.count ?? 0,
    upcoming: upcomingRes.count ?? 0,
    createdInRange: createdRes.count ?? 0,
    completedInRange: completed,
    cancelledInRange: cancelled,
    completionRate: concluded === 0 ? null : (completed / concluded) * 100,
  };
}

export type ReminderReport = {
  scheduled: number;
  sent: number;
  failed: number;
  cancelled: number;
  skipped: number;
  successRate: number | null;
};

/** Section 18 -- only ever counts recorded delivery states; never claims delivery beyond what the configured provider reported. */
export async function getReminderReport(scope: Scope): Promise<ReminderReport> {
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("reminders")
    .select("status")
    .eq("organization_id", scope.organizationId)
    .gte("scheduled_for", scope.range.startUtc)
    .lt("scheduled_for", scope.range.endUtc);
  if (scope.clinicId) q = q.eq("clinic_id", scope.clinicId);

  const { data } = await q;
  const rows = data ?? [];
  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return {
    scheduled: rows.filter((r) => r.status === "scheduled").length,
    sent,
    failed,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    successRate: sent + failed === 0 ? null : (sent / (sent + failed)) * 100,
  };
}
