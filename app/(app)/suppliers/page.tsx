import { Truck, Plus, Search } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Pagination } from "@/components/patterns/pagination";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listSuppliers, SUPPLIERS_PAGE_SIZE } from "./queries";
import { SuppliersTable } from "./suppliers-table";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { SuppliersSearchBar } from "./suppliers-search-bar";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("suppliers.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = single(params.q);
  const status = single(params.status) as "active" | "inactive" | "all" | undefined;
  const page = Number(single(params.page)) || 1;

  const [{ rows, total }, canManage] = await Promise.all([
    listSuppliers(organizationId, { q, status, page }),
    can("suppliers.manage", { organizationId }),
  ]);

  const buildHref = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (p > 1) qs.set("page", String(p));
    const query = qs.toString();
    return query ? `/suppliers?${query}` : "/suppliers";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Suppliers"
        description="Vendors you order products from."
        actions={
          <PermissionGate allowed={canManage}>
            <SupplierFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add supplier
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      <SuppliersSearchBar />

      {rows.length === 0 ? (
        <EmptyState
          icon={q || status ? Search : Truck}
          title={q || status ? "No suppliers match these filters" : "No suppliers yet"}
          description={
            q || status
              ? "Try a different search term."
              : "Add your first supplier to start creating purchase orders."
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <SuppliersTable suppliers={rows} canManage={canManage} />
          <Pagination
            page={page}
            pageSize={SUPPLIERS_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
