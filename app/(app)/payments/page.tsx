import Link from "next/link";
import { Wallet, CalendarDays, CalendarRange, XCircle, AlertTriangle, ClipboardCheck } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Pagination } from "@/components/patterns/pagination";
import { StatTile } from "@/components/patterns/stat-tile";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listClinicOptions } from "../patients/queries";
import { listPayments, getPaymentMetrics, PAYMENTS_PAGE_SIZE, type PaymentListFilters } from "./queries";
import type { PaymentStatus } from "@/lib/validation/payment.schema";
import { paymentStatuses } from "@/lib/validation/payment.schema";
import { PaymentsFilterBar } from "./payments-filter-bar";
import { PaymentsTable } from "./payments-table";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("payments.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const statusParam = single(params.status);
  const filters: PaymentListFilters = {
    q: single(params.q),
    clinicId: single(params.clinic),
    paymentMethod: single(params.method),
    status:
      statusParam && (paymentStatuses as readonly string[]).includes(statusParam)
        ? (statusParam as PaymentStatus)
        : undefined,
    page: Number(single(params.page)) || 1,
  };

  const [{ rows, total }, clinics, metrics, canReconcile] = await Promise.all([
    listPayments(organizationId, filters),
    listClinicOptions(organizationId),
    getPaymentMetrics(organizationId),
    can("payments.reconcile", { organizationId }),
  ]);

  const hasActiveFilters = Boolean(filters.q || filters.clinicId || filters.status || filters.paymentMethod);

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.clinicId) qs.set("clinic", filters.clinicId);
    if (filters.paymentMethod) qs.set("method", filters.paymentMethod);
    if (filters.status) qs.set("status", filters.status);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/payments?${query}` : "/payments";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Every payment recorded across your clinics."
        actions={
          <PermissionGate allowed={canReconcile}>
            <Button asChild variant="outline" size="sm">
              <Link href="/payments/reconciliation">
                <ClipboardCheck className="size-4" />
                Reconciliation
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Today"
          icon={CalendarDays}
          value={new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(Number(metrics.paymentsToday))}
        />
        <StatTile
          label="This month"
          icon={CalendarRange}
          value={new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(Number(metrics.paymentsThisMonth))}
        />
        <StatTile label="Failed (this month)" icon={XCircle} value={String(metrics.failedCount)} />
        <StatTile label="Needs review" icon={AlertTriangle} value={String(metrics.pendingReviewCount)} />
      </div>

      <PaymentsFilterBar clinics={clinics} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={hasActiveFilters ? "No payments match these filters" : "No payments yet"}
          description={
            hasActiveFilters
              ? "Try a different search term or clear your filters."
              : "Payments recorded against invoices will appear here."
          }
        />
      ) : (
        <Card className="gap-0 p-0">
          <PaymentsTable payments={rows} />
          <Pagination page={filters.page ?? 1} pageSize={PAYMENTS_PAGE_SIZE} total={total} buildHref={buildHref} />
        </Card>
      )}
    </div>
  );
}
