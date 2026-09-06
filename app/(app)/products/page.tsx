import { Package, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Pagination } from "@/components/patterns/pagination";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listSupplierOptions } from "../suppliers/queries";
import {
  listProducts,
  listProductCategories,
  PRODUCTS_PAGE_SIZE,
  type ProductListFilters,
} from "./queries";
import { ProductsTable } from "./products-table";
import { ProductsFilterBar } from "./products-filter-bar";
import { ProductFormDialog } from "./product-form-dialog";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("inventory.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filters: ProductListFilters = {
    q: single(params.q),
    category: single(params.category),
    status: (single(params.status) as ProductListFilters["status"]) ?? undefined,
    page: Number(single(params.page)) || 1,
  };

  const [{ rows, total }, categories, suppliers, canManage] = await Promise.all([
    listProducts(organizationId, filters),
    listProductCategories(organizationId),
    listSupplierOptions(organizationId),
    can("products.manage", { organizationId }),
  ]);

  const hasActiveFilters = Boolean(
    filters.q || filters.category || (filters.status && filters.status !== "active"),
  );

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.category) qs.set("category", filters.category);
    if (filters.status) qs.set("status", filters.status);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/products?${query}` : "/products";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description="The catalogue of tracked and untracked products across your organization."
        actions={
          <PermissionGate allowed={canManage}>
            <ProductFormDialog
              suppliers={suppliers}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add product
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      <ProductsFilterBar categories={categories} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hasActiveFilters ? "No products match these filters" : "No products yet"}
          description={
            hasActiveFilters
              ? "Try a different search term or clear your filters."
              : "Add your first product to get started."
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <ProductsTable products={rows} />
          <Pagination
            page={filters.page ?? 1}
            pageSize={PRODUCTS_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
