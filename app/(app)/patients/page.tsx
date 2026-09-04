import { Users, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listPatients,
  listClinicOptions,
  listPractitionerOptions,
  PATIENTS_PAGE_SIZE,
  type PatientListFilters,
} from "./queries";
import type { PatientStatus } from "@/lib/validation/patient.schema";
import { PatientsFilterBar } from "./patients-filter-bar";
import { PatientsTable } from "./patients-table";
import { PatientFormDialog } from "./patient-form-dialog";

const STATUS_VALUES: readonly string[] = ["active", "inactive", "archived"];

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  // patients.view (see every patient in accessible clinics) and
  // patients.view.assigned (see only assigned patients) are separate grants
  // -- see migration 0011's patients_select_assigned policy. Either is
  // enough to open this page; RLS itself resolves which rows come back.
  const [canViewBroad, canViewAssigned] = await Promise.all([
    can("patients.view", { organizationId }),
    can("patients.view.assigned", { organizationId }),
  ]);
  if (!canViewBroad && !canViewAssigned) {
    await requirePermission("patients.view", { organizationId });
  }

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const statusParam = single(params.status);
  const filters: PatientListFilters = {
    q: single(params.q),
    clinicId: single(params.clinic),
    status:
      statusParam && STATUS_VALUES.includes(statusParam) ? (statusParam as PatientStatus) : undefined,
    practitionerId: single(params.practitioner),
    page: Number(single(params.page)) || 1,
  };

  const [{ rows, total }, clinics, practitioners, canCreate, canDelete] = await Promise.all([
    listPatients(organizationId, filters),
    listClinicOptions(organizationId),
    listPractitionerOptions(organizationId),
    can("patients.create", { organizationId }),
    can("patients.delete", { organizationId }),
  ]);

  const hasActiveFilters = Boolean(
    filters.q || filters.clinicId || filters.status || filters.practitionerId,
  );

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.clinicId) qs.set("clinic", filters.clinicId);
    if (filters.status) qs.set("status", filters.status);
    if (filters.practitionerId) qs.set("practitioner", filters.practitionerId);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/patients?${query}` : "/patients";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Patients"
        description="Your organization's patient records."
        actions={
          <PermissionGate allowed={canCreate}>
            <PatientFormDialog
              clinics={clinics}
              practitioners={practitioners}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add patient
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      <PatientsFilterBar clinics={clinics} practitioners={practitioners} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasActiveFilters ? "No patients match these filters" : "No patients yet"}
          description={
            hasActiveFilters
              ? "Try a different search term or clear your filters."
              : "Add your first patient to start building your patient database."
          }
          action={
            !hasActiveFilters && (
              <PermissionGate allowed={canCreate}>
                <PatientFormDialog
                  clinics={clinics}
                  practitioners={practitioners}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Plus className="size-4" />
                      Add patient
                    </Button>
                  }
                />
              </PermissionGate>
            )
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <PatientsTable patients={rows} canDelete={canDelete} />
          <Pagination
            page={filters.page ?? 1}
            pageSize={PATIENTS_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
