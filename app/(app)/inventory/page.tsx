import { Boxes, Package, AlertTriangle, XCircle, Clock, Ban } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Pagination } from "@/components/patterns/pagination";
import { StatTile } from "@/components/patterns/stat-tile";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Card } from "@/components/ui/card";
import { listClinicOptions } from "../patients/queries";
import { listProductCategories } from "../products/queries";
import {
  listInventory,
  getInventoryMetrics,
  INVENTORY_PAGE_SIZE,
  type InventoryListFilters,
} from "./queries";
import type { StockStatus } from "@/lib/validation/inventory.schema";
import { InventoryFilterBar } from "./inventory-filter-bar";
import { InventoryTable } from "./inventory-table";

/** Valuation method (section 17): quantity_on_hand x the product's stored unit_cost. Never a "market value." Documented also in docs/modules/INVENTORY.md. */
function money(v: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(Number(v));
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("inventory.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filters: InventoryListFilters = {
    q: single(params.q),
    clinicId: single(params.clinic),
    category: single(params.category),
    status: single(params.status) as StockStatus | "all" | undefined,
    expiration: single(params.expiration) as "expiring_soon" | "expired" | "all" | undefined,
    page: Number(single(params.page)) || 1,
  };

  const [{ rows, total }, clinics, categories, metrics, canViewValue] = await Promise.all([
    listInventory(organizationId, filters),
    listClinicOptions(organizationId),
    listProductCategories(organizationId),
    getInventoryMetrics(organizationId),
    can("reports.inventory", { organizationId }),
  ]);

  const hasActiveFilters = Boolean(
    filters.q || filters.clinicId || filters.category || filters.status || filters.expiration,
  );

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.clinicId) qs.set("clinic", filters.clinicId);
    if (filters.category) qs.set("category", filters.category);
    if (filters.status) qs.set("status", filters.status);
    if (filters.expiration) qs.set("expiration", filters.expiration);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/inventory?${query}` : "/inventory";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inventory" description="Stock on hand across every clinic." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Products" icon={Package} value={String(metrics.totalProducts)} />
        <PermissionGate allowed={canViewValue}>
          <StatTile label="Inventory value" icon={Boxes} value={money(metrics.totalValue)} />
        </PermissionGate>
        <StatTile label="Low stock" icon={AlertTriangle} value={String(metrics.lowStockCount)} />
        <StatTile label="Out of stock" icon={XCircle} value={String(metrics.outOfStockCount)} />
        <StatTile label="Expiring soon" icon={Clock} value={String(metrics.expiringSoonCount)} />
        <StatTile label="Expired" icon={Ban} value={String(metrics.expiredCount)} />
      </div>

      <InventoryFilterBar clinics={clinics} categories={categories} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={
            hasActiveFilters ? "No inventory matches these filters" : "No inventory recorded yet"
          }
          description={
            hasActiveFilters
              ? "Try a different search term or clear your filters."
              : "Receive stock for a product to see it here."
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <InventoryTable rows={rows} />
          <Pagination
            page={filters.page ?? 1}
            pageSize={INVENTORY_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
