import { Receipt, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listClinicOptions } from "../patients/queries";
import { listInvoices, INVOICES_PAGE_SIZE, type InvoiceListFilters } from "./queries";
import type { InvoiceStatus } from "@/lib/validation/invoice.schema";
import { invoiceStatuses } from "@/lib/validation/invoice.schema";
import { InvoicesFilterBar } from "./invoices-filter-bar";
import { InvoicesTable } from "./invoices-table";
import { NewInvoiceDialog } from "./new-invoice-dialog";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("invoices.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const statusParam = single(params.status);
  const filters: InvoiceListFilters = {
    q: single(params.q),
    clinicId: single(params.clinic),
    status:
      statusParam === "overdue" ||
      (statusParam && (invoiceStatuses as readonly string[]).includes(statusParam))
        ? (statusParam as InvoiceStatus | "overdue")
        : undefined,
    page: Number(single(params.page)) || 1,
  };

  const [{ rows, total }, clinics, canCreate] = await Promise.all([
    listInvoices(organizationId, filters),
    listClinicOptions(organizationId),
    can("invoices.create", { organizationId }),
  ]);

  const hasActiveFilters = Boolean(filters.q || filters.clinicId || filters.status);

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.clinicId) qs.set("clinic", filters.clinicId);
    if (filters.status) qs.set("status", filters.status);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/invoices?${query}` : "/invoices";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        description="Every invoice across your clinics."
        actions={
          <PermissionGate allowed={canCreate}>
            <NewInvoiceDialog
              clinics={clinics}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  New invoice
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      <InvoicesFilterBar clinics={clinics} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasActiveFilters ? "No invoices match these filters" : "No invoices yet"}
          description={
            hasActiveFilters
              ? "Try a different search term or clear your filters."
              : "Create your first invoice to start billing."
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <InvoicesTable invoices={rows} />
          <Pagination
            page={filters.page ?? 1}
            pageSize={INVOICES_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
