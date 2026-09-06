import Link from "next/link";
import {
  DollarSign,
  CalendarCheck,
  UserPlus,
  Wallet,
  CheckCircle2,
  XCircle,
  Building2,
  Users,
  AlertTriangle,
  Boxes,
  Clock,
} from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { StatTile } from "@/components/patterns/stat-tile";
import { ComparisonBadge } from "@/components/patterns/comparison-badge";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { ReportFilterBar } from "@/components/patterns/report-filter-bar";
import { TrendChart } from "@/components/patterns/trend-chart";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AppointmentStatusBadge } from "@/components/patterns/appointment-status-badge";
import { formatCurrency, formatPercent } from "@/lib/reporting/format";
import { listPractitionerOptions } from "../patients/queries";
import { listAppointments } from "../appointments/queries";
import { listFollowUps } from "../followups/queries";
import { getReportingContext, parseReportSearchParams } from "../reports/context";
import { getDashboardSummary } from "../reports/dashboard-queries";

/**
 * The Executive Dashboard (section 6) -- Workflow 1/2 of the Phase 8 spec.
 * Every widget is scoped to `range`/`clinic`/`practitioner` from the URL via
 * ReportFilterBar, and every number comes from app/(app)/reports/*-queries.ts
 * -- never a value computed inline here.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
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
    canViewFinancials,
    canViewInventory,
    canViewReports,
    reportingContext,
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
    can("reports.financial", { organizationId }),
    can("inventory.view", { organizationId }),
    can("reports.view", { organizationId }),
    getReportingContext(organizationId),
  ]);

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { range, clinicId } = parseReportSearchParams(params, reportingContext.timezone);
  const practitionerId = single(params.practitioner) || undefined;
  const practitioners = canViewAppointments ? await listPractitionerOptions(organizationId) : [];

  const summary =
    canViewReports || canViewFinancials || canViewAppointments
      ? await getDashboardSummary(
          { organizationId, clinicId, practitionerId, range },
          reportingContext.clinics,
        )
      : null;

  const [upcomingAppointments, dueFollowUps] = await Promise.all([
    canViewAppointments
      ? listAppointments(organizationId, { clinicId, staffId: practitionerId, page: 1 }).then((r) =>
          r.rows.slice(0, 6),
        )
      : Promise.resolve([]),
    canViewFollowUps
      ? listFollowUps(organizationId, { clinicId, bucket: "overdue", page: 1 }).then((r) =>
          r.rows.slice(0, 6),
        )
      : Promise.resolve([]),
  ]);

  const drilldown = (path: string, extra: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    if (clinicId) qs.set("clinic", clinicId);
    for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
    const q = qs.toString();
    return q ? `${path}?${q}` : path;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your business at a glance." />

      <ReportFilterBar
        clinics={reportingContext.clinics}
        practitioners={canViewAppointments ? practitioners : undefined}
      />

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PermissionGate allowed={canViewFinancials}>
              <Link href={drilldown("/payments", {})}>
                <StatTile
                  label={`Collected (${range.label})`}
                  value={formatCurrency(summary.revenue.collected, reportingContext.currency)}
                  icon={DollarSign}
                  change={<ComparisonBadge change={summary.revenue.change} />}
                />
              </Link>
            </PermissionGate>
            <PermissionGate allowed={canViewAppointments}>
              <Link
                href={drilldown("/appointments", {
                  from: range.startUtc.slice(0, 10),
                  to: range.endUtc.slice(0, 10),
                })}
              >
                <StatTile
                  label={`Appointments (${range.label})`}
                  value={String(summary.appointments.total)}
                  icon={CalendarCheck}
                  change={<ComparisonBadge change={summary.appointments.change} />}
                />
              </Link>
            </PermissionGate>
            <PermissionGate allowed={canViewPatients}>
              <Link href={drilldown("/patients", {})}>
                <StatTile
                  label={`New Patients (${range.label})`}
                  value={String(summary.newPatients.count)}
                  icon={UserPlus}
                  change={<ComparisonBadge change={summary.newPatients.change} />}
                />
              </Link>
            </PermissionGate>
            <PermissionGate allowed={canViewFinancials}>
              <Link href={drilldown("/invoices", { status: "overdue" })}>
                <StatTile
                  label="Outstanding (current)"
                  value={formatCurrency(summary.revenue.outstanding, reportingContext.currency)}
                  icon={Wallet}
                />
              </Link>
            </PermissionGate>
            <PermissionGate allowed={canViewAppointments}>
              <StatTile
                label="Completion Rate"
                value={
                  summary.appointments.completionRate === null
                    ? "N/A"
                    : formatPercent(summary.appointments.completionRate)
                }
                icon={CheckCircle2}
              />
            </PermissionGate>
            <PermissionGate allowed={canViewAppointments}>
              <Link
                href={drilldown("/appointments", {
                  status: "no_show",
                  from: range.startUtc.slice(0, 10),
                  to: range.endUtc.slice(0, 10),
                })}
              >
                <StatTile
                  label="No-Show Rate"
                  value={
                    summary.appointments.noShowRate === null
                      ? "N/A"
                      : formatPercent(summary.appointments.noShowRate)
                  }
                  icon={XCircle}
                />
              </Link>
            </PermissionGate>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PermissionGate allowed={canViewFinancials}>
              <Card className="gap-3 p-5">
                <h2 className="text-sm font-medium">Revenue Trend</h2>
                <TrendChart
                  data={summary.revenueTrend.map((p) => ({
                    label: p.label,
                    collected: p.collected,
                  }))}
                  series={[{ key: "collected", label: "Collected", colorVar: "--chart-1" }]}
                  valueFormat={{ style: "currency", currency: reportingContext.currency }}
                />
              </Card>
            </PermissionGate>
            <PermissionGate allowed={canViewAppointments}>
              <Card className="gap-3 p-5">
                <h2 className="text-sm font-medium">Appointments Trend</h2>
                <TrendChart
                  data={summary.appointmentTrend.map((p) => ({
                    label: p.label,
                    completed: p.completed,
                    cancelled: p.cancelled,
                    noShow: p.noShow,
                  }))}
                  series={[
                    { key: "completed", label: "Completed", colorVar: "--chart-1" },
                    { key: "cancelled", label: "Cancelled", colorVar: "--chart-2" },
                    { key: "noShow", label: "No Show", colorVar: "--chart-3" },
                  ]}
                />
              </Card>
            </PermissionGate>
          </div>

          {!clinicId && summary.clinicPerformance.length > 1 && (
            <PermissionGate allowed={canViewReports}>
              <Card className="gap-3 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">Clinic Performance</h2>
                  <Button asChild variant="link" size="sm">
                    <Link href="/reports/business?tab=clinics">Compare clinics →</Link>
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clinic</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Appointments</TableHead>
                      <TableHead>New Patients</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.clinicPerformance.map((row) => (
                      <TableRow key={row.clinicId}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/dashboard?clinic=${row.clinicId}&range=${range.key}`}
                            className="hover:underline"
                          >
                            {row.clinicName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(row.revenue, reportingContext.currency)}
                        </TableCell>
                        <TableCell>{row.appointments}</TableCell>
                        <TableCell>{row.newPatients}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </PermissionGate>
          )}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <PermissionGate allowed={canViewAppointments}>
          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Upcoming Appointments</h2>
              <Button asChild variant="link" size="sm">
                <Link href="/appointments">View all →</Link>
              </Button>
            </div>
            {upcomingAppointments.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing scheduled.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcomingAppointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{a.patientName}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(a.startAt))}
                      </p>
                    </div>
                    <AppointmentStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </PermissionGate>

        <PermissionGate allowed={canViewFollowUps}>
          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Overdue Follow-Ups</h2>
              <Button asChild variant="link" size="sm">
                <Link href="/followups?bucket=overdue">View all →</Link>
              </Button>
            </div>
            {dueFollowUps.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing overdue.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dueFollowUps.map((f) => (
                  <li key={f.id} className="flex items-center justify-between text-sm">
                    <p className="font-medium">{f.patientName}</p>
                    <p className="text-muted-foreground text-xs">
                      Due{" "}
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(f.dueAt),
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </PermissionGate>

        <PermissionGate allowed={canViewInventory}>
          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Inventory Alerts</h2>
              <Button asChild variant="link" size="sm">
                <Link href="/inventory">View all →</Link>
              </Button>
            </div>
            {summary ? (
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex items-center justify-between">
                  <Link
                    href={drilldown("/inventory", { status: "low_stock" })}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <AlertTriangle className="text-warning size-4" aria-hidden />
                    Low Stock
                  </Link>
                  <span className="font-medium tabular-nums">
                    {summary.inventoryAlerts.lowStock}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <Link
                    href={drilldown("/inventory", { status: "out_of_stock" })}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Boxes className="text-destructive size-4" aria-hidden />
                    Out of Stock
                  </Link>
                  <span className="font-medium tabular-nums">
                    {summary.inventoryAlerts.outOfStock}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <Link
                    href={drilldown("/inventory", { expiration: "expiring_soon" })}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Clock className="text-muted-foreground size-4" aria-hidden />
                    Expiring Soon
                  </Link>
                  <span className="font-medium tabular-nums">
                    {summary.inventoryAlerts.expiringSoon}
                  </span>
                </li>
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No alerts.</p>
            )}
          </Card>
        </PermissionGate>
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
          </div>
          <div className="flex flex-wrap gap-2">
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
            <PermissionGate allowed={canViewFinancials}>
              <Button asChild variant="outline" size="sm">
                <Link href="/reports/financial">Financial reports</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewReports}>
              <Button asChild variant="outline" size="sm">
                <Link href="/reports/business">Business reports</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewInventory}>
              <Button asChild variant="outline" size="sm">
                <Link href="/reports/inventory">Inventory reports</Link>
              </Button>
            </PermissionGate>
          </div>
        </CardContent>
      </Card>

      {!summary && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            Business metrics appear here once you have permission to view reports.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
