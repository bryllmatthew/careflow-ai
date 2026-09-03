import { Building2, Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClinicFormDialog } from "./clinic-form-dialog";
import { ClinicsTable, type ClinicRow } from "./clinics-table";

export default async function ClinicsPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("clinic.view", { organizationId });

  const supabase = await getSupabaseServerClient();
  const [{ data: clinics }, canCreate] = await Promise.all([
    supabase
      .from("clinics")
      .select("id, name, address, phone, email, timezone, status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name"),
    can("clinic.create", { organizationId }),
  ]);

  // Per-clinic, not a single org-wide check: a clinic_manager can hold
  // clinic.update scoped to just one clinic (docs/AUTHORIZATION.md -- "Clinic
  // Manager... cannot access other clinics unless explicitly assigned"), so
  // whether THIS row's edit/delete controls should show varies per row.
  const rows: ClinicRow[] = await Promise.all(
    (clinics ?? []).map(async (c) => {
      const [canUpdate, canDelete] = await Promise.all([
        can("clinic.update", { organizationId, clinicId: c.id }),
        can("clinic.delete", { organizationId, clinicId: c.id }),
      ]);
      return { ...c, canUpdate, canDelete };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clinics"
        description="The branches within your organization."
        actions={
          <PermissionGate allowed={canCreate}>
            <ClinicFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add clinic
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clinics yet"
          description="Add your first clinic to start scheduling and managing patients there."
          action={
            <PermissionGate allowed={canCreate}>
              <ClinicFormDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="size-4" />
                    Add clinic
                  </Button>
                }
              />
            </PermissionGate>
          }
        />
      ) : (
        <Card className="p-0">
          <ClinicsTable clinics={rows} />
        </Card>
      )}
    </div>
  );
}
