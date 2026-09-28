import { notFound } from "next/navigation";
import {
  CalendarClock,
  Stethoscope,
  Receipt,
  Wallet,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PatientStatusBadge } from "@/components/patterns/patient-status-badge";
import { Money } from "@/components/patterns/money";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/patterns/url-tabs";
import { getClinicDentalContext, getPatientDentalRecord, listTeeth } from "@/lib/dental/queries";
import { buildHistory } from "@/lib/dental/chart";
import { DentalChartPanel } from "@/components/dental/dental-chart-panel";
import { DentalHistoryList } from "@/components/dental/dental-history-list";
import { getPatientById, listClinicOptions, listPractitionerOptions } from "../queries";
import { PatientQuickActions } from "../patient-quick-actions";
import { PatientTimeline, buildPatientTimeline } from "../patient-timeline";
import { listServiceOptions } from "../../services/queries";
import { listPatientAppointments } from "../../appointments/queries";
import { AppointmentsTable } from "../../appointments/appointments-table";
import { listPatientFollowUps } from "../../followups/queries";
import { FollowUpsTable } from "../../followups/followups-table";
import { listPatientInvoices, getPatientOutstandingBalance } from "../../invoices/queries";
import { InvoicesTable } from "../../invoices/invoices-table";
import { listPatientPayments, listPatientRefunds } from "../../payments/queries";
import { PaymentsTable } from "../../payments/payments-table";

export default async function PatientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ appointment?: string }>;
}) {
  const { id } = await params;
  const { appointment: linkedAppointmentId } = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  // No requirePermission() gate here: the RLS-backed getPatientById() query
  // itself is the access check -- if the row isn't SELECT-visible to this
  // user (wrong org, wrong clinic, not assigned), it comes back null and
  // this renders the same not-found page a nonexistent id would, rather
  // than leaking that a patient exists somewhere they can't see.
  const patient = await getPatientById(id);
  if (!patient) notFound();

  const [
    clinics,
    practitioners,
    services,
    appointments,
    followUps,
    canUpdate,
    canRecordPayment,
    canBookAppointment,
    canUpdateAppointment,
    canCancelAppointment,
    canRescheduleAppointment,
    canAddFollowUp,
    canManageFollowUps,
    canCreateAppointmentInvoice,
    canViewInvoices,
    canCreateInvoice,
    canViewPayments,
  ] = await Promise.all([
    listClinicOptions(organizationId),
    listPractitionerOptions(organizationId),
    listServiceOptions(organizationId),
    listPatientAppointments(patient.id),
    listPatientFollowUps(patient.id),
    can("patients.update", { organizationId, clinicId: patient.clinicId }),
    can("payments.create", { organizationId, clinicId: patient.clinicId }),
    can("appointments.create", { organizationId, clinicId: patient.clinicId }),
    can("appointments.update", { organizationId, clinicId: patient.clinicId }),
    can("appointments.cancel", { organizationId, clinicId: patient.clinicId }),
    can("appointments.reschedule", { organizationId, clinicId: patient.clinicId }),
    can("followups.create", { organizationId, clinicId: patient.clinicId }),
    can("followups.manage", { organizationId, clinicId: patient.clinicId }),
    can("invoices.create", { organizationId, clinicId: patient.clinicId }),
    can("invoices.view", { organizationId, clinicId: patient.clinicId }),
    can("invoices.create", { organizationId, clinicId: patient.clinicId }),
    can("payments.view", { organizationId, clinicId: patient.clinicId }),
  ]);

  const [invoices, outstandingBalance, payments, refunds] = await Promise.all([
    canViewInvoices ? listPatientInvoices(patient.id) : Promise.resolve([]),
    canViewInvoices ? getPatientOutstandingBalance(patient.id) : Promise.resolve(null),
    canViewPayments ? listPatientPayments(patient.id) : Promise.resolve([]),
    canViewPayments ? listPatientRefunds(patient.id) : Promise.resolve([]),
  ]);

  // The dental module appears for a patient of a DENTAL clinic, to someone
  // holding dental.view there. It is the patient's clinic that decides, not
  // anything about the user: someone with access to a dental branch and an
  // aesthetic branch sees a chart only on the dental branch's patients. This
  // is the UI half; RLS refuses the same rows independently (migration 0025).
  const dentalContext = await getClinicDentalContext(patient.clinicId);
  const [canViewDental, canRecordDental, canCompleteDental] = dentalContext?.isDental
    ? await Promise.all([
        can("dental.view", { organizationId, clinicId: patient.clinicId }),
        can("dental.record", { organizationId, clinicId: patient.clinicId }),
        can("dental.complete", { organizationId, clinicId: patient.clinicId }),
      ])
    : [false, false, false];
  const showDental = Boolean(dentalContext?.isDental && canViewDental);
  const [teeth, dentalRecord] = showDental
    ? await Promise.all([listTeeth(), getPatientDentalRecord(patient.id)])
    : [[], { conditions: [], treatments: [] }];

  const shortId = patient.id.slice(-8).toUpperCase();
  const timeline = buildPatientTimeline(patient, followUps, invoices, payments, refunds);
  const upcomingFollowUps = followUps.filter(
    (f) => f.status === "pending" || f.status === "in_progress",
  );
  const followUpHistory = followUps.filter(
    (f) => f.status === "completed" || f.status === "cancelled",
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        description={`Patient #${shortId} · ${patient.clinicName ?? "Unknown clinic"}`}
      />

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <PatientStatusBadge status={patient.status} />
            <span className="text-muted-foreground">
              {[patient.phone, patient.email].filter(Boolean).join(" · ") ||
                "No contact info on file"}
            </span>
          </div>
          {outstandingBalance !== null && Number(outstandingBalance) > 0 && (
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Outstanding balance</p>
              <p className="text-destructive text-lg font-semibold">
                <Money value={outstandingBalance} />
              </p>
            </div>
          )}
        </div>
        <Separator />
        <PatientQuickActions
          patient={patient}
          clinics={clinics}
          practitioners={practitioners}
          services={services}
          canUpdate={canUpdate}
          canBookAppointment={canBookAppointment}
          canRecordPayment={canRecordPayment}
          canAddFollowUp={canAddFollowUp}
          canCreateInvoice={canCreateInvoice}
        />
      </Card>

      <UrlTabs defaultValue={showDental && linkedAppointmentId ? "dental" : "overview"}>
        <TabsList className="flex-wrap group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {showDental && <TabsTrigger value="dental">Dental Chart</TabsTrigger>}
          {showDental && <TabsTrigger value="dental-history">Dental History</TabsTrigger>}
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="followups">Follow-Ups</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-3 p-5">
              <h2 className="text-sm font-medium">Patient information</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Date of birth</dt>
                <dd>{patient.dateOfBirth ?? "—"}</dd>
                <dt className="text-muted-foreground">Gender</dt>
                <dd className="capitalize">{patient.gender?.replaceAll("_", " ") ?? "—"}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{patient.phone ?? "—"}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{patient.email ?? "—"}</dd>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{patient.address ?? "—"}</dd>
                <dt className="text-muted-foreground">Primary clinic</dt>
                <dd>{patient.clinicName ?? "—"}</dd>
                <dt className="text-muted-foreground">Assigned practitioner</dt>
                <dd>{patient.assignedPractitionerName ?? "Unassigned"}</dd>
              </dl>
              {patient.notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                      Notes
                    </h3>
                    <p className="text-sm whitespace-pre-wrap">{patient.notes}</p>
                  </div>
                </>
              )}
            </Card>

            <Card className="gap-3 p-5">
              <h2 className="text-sm font-medium">Activity</h2>
              <PatientTimeline events={timeline} />
            </Card>
          </div>
        </TabsContent>

        {showDental && dentalContext && (
          <TabsContent value="dental">
            <DentalChartPanel
              patientId={patient.id}
              teeth={teeth}
              numbering={dentalContext.toothNumbering}
              conditions={dentalRecord.conditions}
              treatments={dentalRecord.treatments}
              appointments={appointments.map((a) => ({
                id: a.id,
                startAt: a.startAt,
                serviceName: a.serviceName,
                staffName: a.staffName,
                status: a.status,
              }))}
              // The database only accepts a service from the patient's own clinic.
              services={services
                .filter((s) => s.clinicId === patient.clinicId)
                .map((s) => ({ id: s.id, name: s.name }))}
              practitioners={practitioners}
              canRecord={canRecordDental}
              canComplete={canCompleteDental}
              linkedAppointmentId={
                appointments.some((a) => a.id === linkedAppointmentId)
                  ? linkedAppointmentId
                  : undefined
              }
            />
          </TabsContent>
        )}

        {showDental && dentalContext && (
          <TabsContent value="dental-history">
            <Card className="p-5">
              <DentalHistoryList
                events={buildHistory(dentalRecord.conditions, dentalRecord.treatments)}
                teeth={teeth}
                numbering={dentalContext.toothNumbering}
                emptyText="No dental history recorded yet. Findings and treatments charted on the Dental Chart tab appear here."
              />
            </Card>
          </TabsContent>
        )}

        <TabsContent value="appointments">
          {appointments.length === 0 ? (
            <Card className="p-0">
              <EmptyState
                icon={CalendarClock}
                title="No appointments yet"
                description="This patient's booked appointments will appear here."
              />
            </Card>
          ) : (
            <Card className="p-0">
              <AppointmentsTable
                appointments={appointments}
                canUpdate={canUpdateAppointment}
                canCancel={canCancelAppointment}
                canReschedule={canRescheduleAppointment}
                canViewDental={showDental}
                canCreateInvoice={canCreateAppointmentInvoice}
              />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="services">
          <Card className="p-0">
            <EmptyState
              icon={Stethoscope}
              title="No services or treatments recorded"
              description="Services and treatment history will appear here once appointments can be completed."
            />
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          {!canViewInvoices ? (
            <Card className="p-0">
              <EmptyState
                icon={Receipt}
                title="No access"
                description="You don't have permission to view this patient's billing information."
              />
            </Card>
          ) : invoices.length === 0 ? (
            <Card className="p-0">
              <EmptyState
                icon={Receipt}
                title="No invoices yet"
                description="Invoices created for this patient will appear here."
              />
            </Card>
          ) : (
            <Card className="p-0">
              <InvoicesTable invoices={invoices} />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {!canViewPayments ? (
            <Card className="p-0">
              <EmptyState
                icon={Wallet}
                title="No access"
                description="You don't have permission to view this patient's payment history."
              />
            </Card>
          ) : payments.length === 0 ? (
            <Card className="p-0">
              <EmptyState
                icon={Wallet}
                title="No payments recorded"
                description="Payments made by this patient will appear here."
              />
            </Card>
          ) : (
            <Card className="p-0">
              <PaymentsTable payments={payments} />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="followups">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="mb-2 text-sm font-medium">Upcoming Follow-Ups</h2>
              {upcomingFollowUps.length === 0 ? (
                <Card className="p-0">
                  <EmptyState
                    icon={ClipboardList}
                    title="No upcoming follow-ups"
                    description="Follow-ups created for this patient will appear here."
                  />
                </Card>
              ) : (
                <Card className="p-0">
                  <FollowUpsTable
                    followUps={upcomingFollowUps}
                    staff={practitioners}
                    canManage={canManageFollowUps}
                  />
                </Card>
              )}
            </div>

            {followUpHistory.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-medium">Follow-Up History</h2>
                <Card className="p-0">
                  <FollowUpsTable
                    followUps={followUpHistory}
                    staff={practitioners}
                    canManage={canManageFollowUps}
                  />
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="communication">
          <Card className="p-0">
            <EmptyState
              icon={MessageCircle}
              title="No communication history"
              description="Messages and calls will appear here once the Communication module ships."
            />
          </Card>
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
