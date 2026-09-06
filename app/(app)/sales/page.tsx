import Link from "next/link";
import { DollarSign, Wallet, AlertTriangle, Ban, Receipt } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { StatTile } from "@/components/patterns/stat-tile";
import { getSalesMetrics } from "../invoices/queries";

/**
 * docs/PRODUCT_SPEC.md Phase 5 section 19. DB-aggregated (getSalesMetrics),
 * never every invoice loaded into the browser to sum client-side. Charts
 * (sales over time, by clinic, by service) and per-invoice-status filtering
 * are Phase 8's "Centralized Dashboard" scope -- this is the section 19
 * business-level snapshot, which the Invoices list page already covers for
 * anything needing to drill into individual invoices.
 */
export default async function SalesPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("sales.view", { organizationId });

  const metrics = await getSalesMetrics(organizationId);
  const money = (v: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(Number(v));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sales" description="Business-level view of invoicing and revenue." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Sales today" value={money(metrics.salesToday)} icon={DollarSign} />
        <StatTile
          label="Sales this month"
          value={money(metrics.salesThisMonth)}
          icon={DollarSign}
        />
        <StatTile label="Outstanding" value={money(metrics.outstanding)} icon={Wallet} />
        <StatTile
          label="Overdue invoices"
          value={String(metrics.overdueCount)}
          icon={AlertTriangle}
        />
        <StatTile label="Voided invoices" value={String(metrics.voidedCount)} icon={Ban} />
        <StatTile label="Paid invoices" value={null} icon={Receipt} />
      </div>

      <p className="text-muted-foreground text-sm">
        &ldquo;Paid invoices&rdquo; has no data yet -- payment recording is Phase 6. See{" "}
        <Link href="/invoices" className="text-primary hover:underline">
          Invoices
        </Link>{" "}
        for the full searchable list.
      </p>
    </div>
  );
}
