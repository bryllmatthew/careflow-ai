import { Stethoscope, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listServices } from "./queries";
import { listClinicOptions } from "../patients/queries";
import { ServiceFormDialog } from "./service-form-dialog";
import { ServicesTable } from "./services-table";

export default async function ServicesPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("services.view", { organizationId });

  const [services, clinics, canManage] = await Promise.all([
    listServices(organizationId, { includeInactive: true }),
    listClinicOptions(organizationId),
    can("services.manage", { organizationId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Services"
        description="The bookable services your organization offers."
        actions={
          <PermissionGate allowed={canManage}>
            <ServiceFormDialog
              clinics={clinics}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add service
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      {services.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No services yet"
          description="Add your first service to start booking appointments against it."
          action={
            <PermissionGate allowed={canManage}>
              <ServiceFormDialog
                clinics={clinics}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="size-4" />
                    Add service
                  </Button>
                }
              />
            </PermissionGate>
          }
        />
      ) : (
        <Card className="p-0">
          <ServicesTable services={services} clinics={clinics} canManage={canManage} />
        </Card>
      )}
    </div>
  );
}
