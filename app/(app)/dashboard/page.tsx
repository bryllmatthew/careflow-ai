import Link from "next/link";
import {
  DollarSign,
  CalendarCheck,
  UserPlus,
  Wallet,
  Building2,
  Users,
  ClipboardList,
  AlertTriangle,
  BellRing,
} from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { StatTile } from "@/components/patterns/stat-tile";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPatientCounts } from "../patients/queries";
import { getAppointmentCounts, getReminderCounts } from "../appointments/queries";
import { getFollowUpCounts } from "../followups/queries";
import { getSalesMetrics } from "../invoices/queries";
import { getPaymentMetrics } from "../payments/queries";

function money(v: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(Number(v));
}

/**
 * The four top-level metrics from docs/UI_UX_SPEC.md ("Dashboard"): revenue
 * and outstanding payments are real as of Phase 5 (gated by
 * reports.financial -- docs/PRODUCT_SPEC.md Phase 5 section 26, "do not
 * expose financial metrics to users without financial/reporting
 * permission"), via the same getSalesMetrics() query the Sales module
 * itself uses. "New patients" (Phase 2) and "Appointments today" (Phase 3)
 * are likewise real. The "Getting started" row shows real counts for
 * clinics, team members and active patients. Charts, clinic comparison and
 * the AI insight card from the same spec section land in Phase 8.
 */
export default async function DashboardPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  const supabase = await getSupabaseServerClient();
  const [
    { count: clinicCount },
    { count: memberCount },
    canViewClinics,
    canViewUsers,
    canViewPatients,
    canViewAppointments,
    canViewFollowUps,
    canViewReminders,
    canViewFinancials,
  ] = await Promise.all([
    supabase
      .from("clinics")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    can("clinic.view", { organizationId }),
    can("users.view", { organizationId }),
    can("patients.view", { organizationId }).then(
      async (broad) => broad || (await can("patients.view.assigned", { organizationId })),
    ),
    can("appointments.view", { organizationId }),
    can("followups.view", { organizationId }),
    can("reminders.view", { organizationId }),
    can("reports.financial", { organizationId }),
  ]);

  const [patientCounts, appointmentCounts, followUpCounts, reminderCounts, salesMetrics, paymentMetrics] =
    await Promise.all([
      canViewPatients ? getPatientCounts(organizationId) : null,
      canViewAppointments ? getAppointmentCounts(organizationId) : null,
      canViewFollowUps ? getFollowUpCounts(organizationId) : null,
      canViewReminders ? getReminderCounts(organizationId) : null,
      canViewFinancials ? getSalesMetrics(organizationId) : null,
      canViewFinancials ? getPaymentMetrics(organizationId) : null,
    ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your business at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Sales this month"
          value={salesMetrics ? money(salesMetrics.salesThisMonth) : null}
          icon={DollarSign}
        />
        <StatTile
          label="Appointments today"
          value={appointmentCounts ? String(appointmentCounts.today) : null}
          icon={CalendarCheck}
        />
        <StatTile
          label="New patients (30d)"
          value={patientCounts ? String(patientCounts.newLast30Days) : null}
          icon={UserPlus}
        />
        <StatTile
          label="Outstanding balance"
          value={salesMetrics ? money(salesMetrics.outstanding) : null}
          icon={Wallet}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Building2 className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{clinicCount ?? 0}</span> clinic
                {clinicCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{memberCount ?? 0}</span> team member
                {memberCount === 1 ? "" : "s"}
              </span>
            </div>
            {patientCounts && (
              <div className="flex items-center gap-2">
                <UserPlus className="text-muted-foreground size-4" aria-hidden />
                <span className="text-sm">
                  <span className="font-medium tabular-nums">{patientCounts.active}</span> active
                  patient{patientCounts.active === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <PermissionGate allowed={canViewClinics}>
              <Button asChild variant="outline" size="sm">
                <Link href="/clinics">Manage clinics</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewUsers}>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/users">Manage users</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewPatients}>
              <Button asChild variant="outline" size="sm">
                <Link href="/patients">View patients</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewAppointments}>
              <Button asChild variant="outline" size="sm">
                <Link href="/calendar">View calendar</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewFollowUps}>
              <Button asChild variant="outline" size="sm">
                <Link href="/followups">View follow-ups</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewFinancials}>
              <Button asChild variant="outline" size="sm">
                <Link href="/sales">View sales</Link>
              </Button>
            </PermissionGate>
          </div>
        </CardContent>
      </Card>

      {(followUpCounts || reminderCounts) && (
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-6">
              {followUpCounts && (
                <>
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={
                        followUpCounts.overdue > 0
                          ? "text-destructive size-4"
                          : "text-muted-foreground size-4"
                      }
                      aria-hidden
                    />
                    <span className="text-sm">
                      <span
                        className={`font-medium tabular-nums ${followUpCounts.overdue > 0 ? "text-destructive" : ""}`}
                      >
                        {followUpCounts.overdue}
                      </span>{" "}
                      overdue follow-up{followUpCounts.overdue === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClipboardList className="text-muted-foreground size-4" aria-hidden />
                    <span className="text-sm">
                      <span className="font-medium tabular-nums">{followUpCounts.dueToday}</span> due today
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClipboardList className="text-muted-foreground size-4" aria-hidden />
                    <span className="text-sm">
                      <span className="font-medium tabular-nums">{followUpCounts.completedLast7Days}</span>{" "}
                      completed (7d)
                    </span>
                  </div>
                </>
              )}
              {reminderCounts && (
                <>
                  <div className="flex items-center gap-2">
                    <BellRing className="text-muted-foreground size-4" aria-hidden />
                    <span className="text-sm">
                      <span className="font-medium tabular-nums">{reminderCounts.sentLast7Days}</span>{" "}
                      reminders sent (7d)
                    </span>
                  </div>
                  {reminderCounts.failed > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="text-destructive size-4" aria-hidden />
                      <span className="text-sm">
                        <span className="text-destructive font-medium tabular-nums">
                          {reminderCounts.failed}
                        </span>{" "}
                        reminder{reminderCounts.failed === 1 ? "" : "s"} failed
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {salesMetrics ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <DollarSign className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{money(salesMetrics.salesToday)}</span> sold today
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={salesMetrics.overdueCount > 0 ? "text-destructive size-4" : "text-muted-foreground size-4"}
                aria-hidden
              />
              <span className="text-sm">
                <span
                  className={`font-medium tabular-nums ${salesMetrics.overdueCount > 0 ? "text-destructive" : ""}`}
                >
                  {salesMetrics.overdueCount}
                </span>{" "}
                overdue invoice{salesMetrics.overdueCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{salesMetrics.voidedCount}</span> voided invoice
                {salesMetrics.voidedCount === 1 ? "" : "s"}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            Business metrics appear here once you have permission to view financial reports.
          </CardContent>
        </Card>
      )}

      {paymentMetrics && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Wallet className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{money(paymentMetrics.paymentsToday)}</span> paid today
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{paymentMetrics.succeededCount}</span> successful
                payment{paymentMetrics.succeededCount === 1 ? "" : "s"} (30d)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={paymentMetrics.failedCount > 0 ? "text-destructive size-4" : "text-muted-foreground size-4"}
                aria-hidden
              />
              <span className="text-sm">
                <span
                  className={`font-medium tabular-nums ${paymentMetrics.failedCount > 0 ? "text-destructive" : ""}`}
                >
                  {paymentMetrics.failedCount}
                </span>{" "}
                failed payment{paymentMetrics.failedCount === 1 ? "" : "s"} (30d)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={
                  paymentMetrics.pendingReviewCount > 0 ? "text-destructive size-4" : "text-muted-foreground size-4"
                }
                aria-hidden
              />
              <span className="text-sm">
                <span
                  className={`font-medium tabular-nums ${paymentMetrics.pendingReviewCount > 0 ? "text-destructive" : ""}`}
                >
                  {paymentMetrics.pendingReviewCount}
                </span>{" "}
                payment{paymentMetrics.pendingReviewCount === 1 ? "" : "s"} needing review
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
