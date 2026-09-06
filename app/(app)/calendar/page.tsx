import { Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Button } from "@/components/ui/button";
import { listClinicOptions, listPractitionerOptions } from "../patients/queries";
import { listServiceOptions } from "../services/queries";
import { listAppointmentsForRange } from "../appointments/queries";
import { AppointmentFormDialog } from "../appointments/appointment-form-dialog";
import { CalendarNav } from "./calendar-nav";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { dayEndISO, dayStartISO, startOfWeek, todayKey, weekRangeISO } from "./date-utils";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("appointments.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const view = single(params.view) === "week" ? "week" : "day";
  const dateParam = single(params.date);
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey();
  const clinicId = single(params.clinic);

  const range =
    view === "day"
      ? { startISO: dayStartISO(date), endISO: dayEndISO(date) }
      : weekRangeISO(startOfWeek(date));

  const [
    clinics,
    practitioners,
    services,
    appointments,
    canCreate,
    canUpdate,
    canCancel,
    canReschedule,
  ] = await Promise.all([
    listClinicOptions(organizationId),
    listPractitionerOptions(organizationId),
    listServiceOptions(organizationId),
    listAppointmentsForRange(organizationId, { ...range, clinicId }),
    can("appointments.create", { organizationId }),
    can("appointments.update", { organizationId }),
    can("appointments.cancel", { organizationId }),
    can("appointments.reschedule", { organizationId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Your clinic's schedule."
        actions={
          <PermissionGate allowed={canCreate}>
            <AppointmentFormDialog
              clinics={clinics}
              practitioners={practitioners}
              services={services}
              defaultClinicId={clinicId}
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

      <CalendarNav date={date} view={view} clinics={clinics} clinicId={clinicId} />

      {view === "day" ? (
        <DayView
          date={date}
          clinicId={clinicId}
          appointments={appointments}
          practitioners={practitioners}
          clinics={clinics}
          services={services}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canCancel={canCancel}
          canReschedule={canReschedule}
        />
      ) : (
        <WeekView
          mondayKey={startOfWeek(date)}
          appointments={appointments}
          canUpdate={canUpdate}
          canCancel={canCancel}
          canReschedule={canReschedule}
        />
      )}
    </div>
  );
}
