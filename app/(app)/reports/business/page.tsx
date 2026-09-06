import { CalendarCheck, UserPlus, CheckCircle2, XCircle, Ban, Users } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { ReportFilterBar } from "@/components/patterns/report-filter-bar";
import { ExportButton } from "@/components/patterns/export-button";
import { ComparisonBadge } from "@/components/patterns/comparison-badge";
import { TrendChart } from "@/components/patterns/trend-chart";
import { Money } from "@/components/patterns/money";
import { StatTile } from "@/components/patterns/stat-tile";
import { Card } from "@/components/ui/card";
import { UrlTabs } from "@/components/patterns/url-tabs";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/lib/reporting/format";
import { listPractitionerOptions } from "../../patients/queries";
import { listServiceOptions } from "../../services/queries";
import { getReportingContext, parseReportSearchParams } from "../context";
import { getAppointmentSummary, getAppointmentTrend } from "../appointment-queries";
import { getPatientSummary, getNewPatientTrend } from "../patient-queries";
import {
  getClinicPerformance,
  getServicePerformance,
  getPractitionerPerformance,
} from "../performance-queries";
import { getFollowUpReport, getReminderReport } from "../followup-queries";

export default async function BusinessReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("reports.view", { organizationId });

  const context = await getReportingContext(organizationId);
  const { range, clinicId } = parseReportSearchParams(params, context.timezone);
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const practitionerId = single(params.practitioner) || undefined;
  const serviceId = single(params.service) || undefined;

  const [practitioners, services] = await Promise.all([
    listPractitionerOptions(organizationId),
    listServiceOptions(organizationId),
  ]);

  const appointmentScope = { organizationId, clinicId, practitionerId, serviceId, range };
  const patientScope = { organizationId, clinicId, range };
  const baseScope = { organizationId, range };

  const [
    appointments,
    appointmentTrend,
    patients,
    newPatientTrend,
    clinicPerformance,
    servicePerformance,
    practitionerPerformance,
    followUps,
    reminders,
  ] = await Promise.all([
    getAppointmentSummary(appointmentScope),
    getAppointmentTrend(appointmentScope),
    getPatientSummary(patientScope),
    getNewPatientTrend(patientScope),
    getClinicPerformance(baseScope, context.clinics),
    getServicePerformance(baseScope, clinicId),
    getPractitionerPerformance(baseScope, clinicId),
    getFollowUpReport({ organizationId, clinicId, range }),
    getReminderReport({ organizationId, clinicId, range }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Business Reports"
        description="Appointments, patients, and performance across clinics, services and practitioners."
      />

      <ReportFilterBar
        clinics={context.clinics}
        practitioners={practitioners}
        services={services}
      />

      <UrlTabs defaultValue="appointments">
        <TabsList className="flex-wrap">
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="clinics">Clinics</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="practitioners">Practitioners</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile
              label="Total"
              icon={CalendarCheck}
              value={String(appointments.total)}
              change={<ComparisonBadge change={appointments.totalChange} />}
            />
            <StatTile
              label="Completion Rate"
              icon={CheckCircle2}
              value={
                appointments.completionRate === null
                  ? "N/A"
                  : formatPercent(appointments.completionRate)
              }
            />
            <StatTile
              label="No-Show Rate"
              icon={XCircle}
              value={
                appointments.noShowRate === null ? "N/A" : formatPercent(appointments.noShowRate)
              }
            />
            <StatTile
              label="Cancellation Rate"
              icon={Ban}
              value={
                appointments.cancellationRate === null
                  ? "N/A"
                  : formatPercent(appointments.cancellationRate)
              }
            />
          </div>
          <Card className="gap-3 p-5">
            <h2 className="text-sm font-medium">Trend</h2>
            <TrendChart
              data={appointmentTrend.map((p) => ({
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
          <Card className="gap-2 p-5">
            <h2 className="text-sm font-medium">By status</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {Object.entries(appointments.byStatus).map(([status, count]) => (
                <div key={status} className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-semibold tabular-nums">{count}</p>
                  <p className="text-muted-foreground text-xs capitalize">
                    {status.replaceAll("_", " ")}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="patients" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile
              label="New Patients"
              icon={UserPlus}
              value={String(patients.newPatients)}
              change={<ComparisonBadge change={patients.newPatientsChange} />}
            />
            <StatTile label="Total Active" icon={Users} value={String(patients.totalActive)} />
            <StatTile
              label="Returning Patients"
              icon={Users}
              value={String(patients.returningPatients)}
            />
            <StatTile
              label="Repeat Appointment Rate"
              icon={Users}
              value={
                patients.repeatAppointmentRate === null
                  ? "N/A"
                  : formatPercent(patients.repeatAppointmentRate)
              }
            />
          </div>
          <Card className="gap-3 p-5">
            <h2 className="text-sm font-medium">New Patient Trend</h2>
            <TrendChart
              data={newPatientTrend.map((p) => ({ label: p.label, count: p.count }))}
              series={[{ key: "count", label: "New Patients", colorVar: "--chart-1" }]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="clinics" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <ExportButton type="clinic-performance" />
          </div>
          <Card className="gap-0 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Appointments</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>No Show</TableHead>
                  <TableHead>Cancellation Rate</TableHead>
                  <TableHead>New Patients</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Low Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clinicPerformance.map((row) => (
                  <TableRow key={row.clinicId}>
                    <TableCell className="font-medium">{row.clinicName}</TableCell>
                    <TableCell>
                      <Money value={row.revenue} currency={context.currency} />
                    </TableCell>
                    <TableCell>{row.appointments}</TableCell>
                    <TableCell>{row.completed}</TableCell>
                    <TableCell>{row.noShow}</TableCell>
                    <TableCell>
                      {row.cancellationRate === null ? "N/A" : formatPercent(row.cancellationRate)}
                    </TableCell>
                    <TableCell>{row.newPatients}</TableCell>
                    <TableCell>
                      <Money value={row.outstanding} currency={context.currency} />
                    </TableCell>
                    <TableCell>{row.lowStockCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <ExportButton type="service-performance" />
          </div>
          <Card className="gap-0 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Appointments</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Cancelled</TableHead>
                  <TableHead>No Show</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Avg / Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicePerformance.map((row) => (
                  <TableRow key={row.serviceId}>
                    <TableCell className="font-medium">{row.serviceName}</TableCell>
                    <TableCell>{row.appointments}</TableCell>
                    <TableCell>{row.completed}</TableCell>
                    <TableCell>{row.cancelled}</TableCell>
                    <TableCell>{row.noShow}</TableCell>
                    <TableCell>
                      <Money value={row.revenue} currency={context.currency} />
                    </TableCell>
                    <TableCell>
                      {row.avgRevenuePerCompleted ? (
                        <Money value={row.avgRevenuePerCompleted} currency={context.currency} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="practitioners" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <ExportButton type="practitioner-performance" />
          </div>
          <Card className="gap-0 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practitioner</TableHead>
                  <TableHead>Appointments</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>No Show</TableHead>
                  <TableHead>Patients</TableHead>
                  <TableHead>Attributed Revenue</TableHead>
                  <TableHead>Follow-ups</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {practitionerPerformance.map((row) => (
                  <TableRow key={row.practitionerId}>
                    <TableCell className="font-medium">{row.practitionerName}</TableCell>
                    <TableCell>{row.appointments}</TableCell>
                    <TableCell>{row.completed}</TableCell>
                    <TableCell>{row.noShow}</TableCell>
                    <TableCell>{row.patientCount}</TableCell>
                    <TableCell>
                      <Money value={row.attributedRevenue} currency={context.currency} />
                    </TableCell>
                    <TableCell>
                      {row.followUpsCompleted}/{row.followUpsAssigned}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <p className="text-muted-foreground text-xs">
            Attributed revenue only counts invoices explicitly linked to one of this
            practitioner&apos;s appointments -- it is never a guessed split of unattributed revenue.
          </p>
        </TabsContent>

        <TabsContent value="followups" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Overdue" icon={Ban} value={String(followUps.overdue)} />
            <StatTile label="Due Today" icon={CalendarCheck} value={String(followUps.dueToday)} />
            <StatTile label="Upcoming" icon={CalendarCheck} value={String(followUps.upcoming)} />
            <StatTile
              label="Completion Rate"
              icon={CheckCircle2}
              value={
                followUps.completionRate === null ? "N/A" : formatPercent(followUps.completionRate)
              }
            />
          </div>
          <Card className="p-5">
            <p className="text-muted-foreground text-sm">
              {followUps.createdInRange} follow-ups created, {followUps.completedInRange} completed,{" "}
              {followUps.cancelledInRange} cancelled in {range.label.toLowerCase()}.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="reminders" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Scheduled" icon={CalendarCheck} value={String(reminders.scheduled)} />
            <StatTile label="Sent" icon={CheckCircle2} value={String(reminders.sent)} />
            <StatTile label="Failed" icon={XCircle} value={String(reminders.failed)} />
            <StatTile
              label="Success Rate"
              icon={CheckCircle2}
              value={reminders.successRate === null ? "N/A" : formatPercent(reminders.successRate)}
            />
          </div>
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
