import { CalendarCheck, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listClinicOptions, listPractitionerOptions } from "../patients/queries";
import { listServiceOptions } from "../services/queries";
import { listAppointments, APPOINTMENTS_PAGE_SIZE, type AppointmentListFilters } from "./queries";
import type { AppointmentStatus } from "@/lib/validation/appointment.schema";
import { appointmentStatuses } from "@/lib/validation/appointment.schema";
import { AppointmentsFilterBar } from "./appointments-filter-bar";
import { AppointmentsTable } from "./appointments-table";
import { AppointmentFormDialog } from "./appointment-form-dialog";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("appointments.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const statusParam = single(params.status);
  const filters: AppointmentListFilters = {
    clinicId: single(params.clinic),
    staffId: single(params.practitioner),
    status:
      statusParam && (appointmentStatuses as readonly string[]).includes(statusParam)
        ? (statusParam as AppointmentStatus)
        : undefined,
    // Optional -- set when arriving from a dashboard/report drill-down link
    // (section 26), so "No-Shows: 18" opens exactly the appointments that
    // made up that number, not every no-show ever recorded.
    startDate: single(params.from),
    endDate: single(params.to),
    page: Number(single(params.page)) || 1,
  };

  const [
    { rows, total },
    clinics,
    practitioners,
    services,
    canCreate,
    canUpdate,
    canCancel,
    canReschedule,
    canCreateInvoice,
  ] = await Promise.all([
    listAppointments(organizationId, filters),
    listClinicOptions(organizationId),
    listPractitionerOptions(organizationId),
    listServiceOptions(organizationId),
    can("appointments.create", { organizationId }),
    can("appointments.update", { organizationId }),
    can("appointments.cancel", { organizationId }),
    can("appointments.reschedule", { organizationId }),
    can("invoices.create", { organizationId }),
  ]);

  const hasActiveFilters = Boolean(filters.clinicId || filters.status || filters.staffId);

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.clinicId) qs.set("clinic", filters.clinicId);
    if (filters.status) qs.set("status", filters.status);
    if (filters.staffId) qs.set("practitioner", filters.staffId);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/appointments?${query}` : "/appointments";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Appointments"
        description="Every booking across your clinics."
        actions={
          <PermissionGate allowed={canCreate}>
            <AppointmentFormDialog
              clinics={clinics}
              practitioners={practitioners}
              services={services}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Book appointment
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      <AppointmentsFilterBar clinics={clinics} practitioners={practitioners} />

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={hasActiveFilters ? "No appointments match these filters" : "No appointments yet"}
          description={
            hasActiveFilters
              ? "Try a different filter combination."
              : "Book your first appointment to start filling the schedule."
          }
          action={
            !hasActiveFilters && (
              <PermissionGate allowed={canCreate}>
                <AppointmentFormDialog
                  clinics={clinics}
                  practitioners={practitioners}
                  services={services}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Plus className="size-4" />
                      Book appointment
                    </Button>
                  }
                />
              </PermissionGate>
            )
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <AppointmentsTable
            appointments={rows}
            canUpdate={canUpdate}
            canCancel={canCancel}
            canReschedule={canReschedule}
            canCreateInvoice={canCreateInvoice}
          />
          <Pagination
            page={filters.page ?? 1}
            pageSize={APPOINTMENTS_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
