import { ClipboardList, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Pagination } from "@/components/patterns/pagination";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listClinicOptions } from "../patients/queries";
import { listSupplierOptions } from "../suppliers/queries";
import {
  listPurchaseOrders,
  PURCHASE_ORDERS_PAGE_SIZE,
  type PurchaseOrderListFilters,
} from "./queries";
import { PurchaseOrdersTable } from "./purchase-orders-table";
import { NewPurchaseOrderDialog } from "./new-purchase-order-dialog";
import { PurchaseOrdersFilterBar } from "./purchase-orders-filter-bar";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("purchase_orders.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filters: PurchaseOrderListFilters = {
    q: single(params.q),
    clinicId: single(params.clinic),
    supplierId: single(params.supplier),
    status: single(params.status),
    page: Number(single(params.page)) || 1,
  };

  const [{ rows, total }, clinics, suppliers, canManage] = await Promise.all([
    listPurchaseOrders(organizationId, filters),
    listClinicOptions(organizationId),
    listSupplierOptions(organizationId),
    can("purchase_orders.manage", { organizationId }),
  ]);

  const hasActiveFilters = Boolean(
    filters.q || filters.clinicId || filters.supplierId || filters.status,
  );

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.clinicId) qs.set("clinic", filters.clinicId);
    if (filters.supplierId) qs.set("supplier", filters.supplierId);
    if (filters.status) qs.set("status", filters.status);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/purchase-orders?${query}` : "/purchase-orders";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Purchase Orders"
        description="Order stock from your suppliers and track receiving."
        actions={
          <PermissionGate allowed={canManage}>
            <NewPurchaseOrderDialog
              clinics={clinics}
              suppliers={suppliers}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  New purchase order
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      <PurchaseOrdersFilterBar clinics={clinics} suppliers={suppliers} />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            hasActiveFilters ? "No purchase orders match these filters" : "No purchase orders yet"
          }
          description={
            hasActiveFilters
              ? "Try a different search term or clear your filters."
              : "Create your first purchase order to reorder stock."
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <PurchaseOrdersTable purchaseOrders={rows} />
          <Pagination
            page={filters.page ?? 1}
            pageSize={PURCHASE_ORDERS_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
