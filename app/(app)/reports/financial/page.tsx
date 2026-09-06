import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { ReportFilterBar } from "@/components/patterns/report-filter-bar";
import { ExportButton } from "@/components/patterns/export-button";
import { Money } from "@/components/patterns/money";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/patterns/stat-tile";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/patterns/url-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Wallet, RotateCcw, TrendingUp } from "lucide-react";
import { getReportingContext, parseReportSearchParams } from "../context";
import {
  getRevenueSummary,
  getRevenueByClinic,
  getRevenueByPaymentMethod,
  getInvoiceStatusBreakdown,
  getPaymentPerformance,
} from "../revenue-queries";
import { getReceivablesReport, agingBucketLabels, type AgingBucket } from "../receivables-queries";
import { ReceivablesFilterBar } from "./receivables-filter-bar";
import { Pagination } from "@/components/patterns/pagination";

export default async function FinancialReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("reports.financial", { organizationId });

  const context = await getReportingContext(organizationId);
  const { range, clinicId } = parseReportSearchParams(params, context.timezone);
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const agingBucket = single(params.aging) as AgingBucket | undefined;
  const page = Number(single(params.page)) || 1;

  const scope = { organizationId, clinicId, range };

  const [revenue, byClinic, byMethod, invoiceStatus, paymentPerformance, receivables] =
    await Promise.all([
      getRevenueSummary(scope),
      getRevenueByClinic(organizationId, range, context.clinics),
      getRevenueByPaymentMethod(scope),
      getInvoiceStatusBreakdown(scope),
      getPaymentPerformance(scope),
      getReceivablesReport(organizationId, { clinicId, agingBucket, page }),
    ]);

  const buildReceivablesHref = (p: number) => {
    const qs = new URLSearchParams();
    qs.set("tab", "receivables");
    if (clinicId) qs.set("clinic", clinicId);
    if (agingBucket) qs.set("aging", agingBucket);
    if (p > 1) qs.set("page", String(p));
    return `/reports/financial?${qs.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financial Reports"
        description="Revenue, receivables, payments and invoice status."
      />

      <ReportFilterBar clinics={context.clinics} />

      <UrlTabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="invoices">Invoice Status</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile
              label="Invoiced"
              icon={DollarSign}
              value={new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: context.currency,
              }).format(Number(revenue.invoiced))}
            />
            <StatTile
              label="Collected"
              icon={Wallet}
              value={new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: context.currency,
              }).format(Number(revenue.collected))}
            />
            <StatTile
              label="Refunded"
              icon={RotateCcw}
              value={new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: context.currency,
              }).format(Number(revenue.refunded))}
            />
            <StatTile
              label="Net Collected"
              icon={TrendingUp}
              value={new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: context.currency,
              }).format(Number(revenue.netCollected))}
            />
          </div>

          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Revenue by Clinic</h2>
              <ExportButton type="revenue-by-clinic" />
            </div>
            {byClinic.length === 0 ? (
              <p className="text-muted-foreground text-sm">No revenue recorded for this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clinic</TableHead>
                    <TableHead>Invoiced</TableHead>
                    <TableHead>Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byClinic.map((r) => (
                    <TableRow key={r.clinicId}>
                      <TableCell className="font-medium">{r.clinicName}</TableCell>
                      <TableCell>
                        <Money value={r.invoiced} currency={context.currency} />
                      </TableCell>
                      <TableCell>
                        <Money value={r.collected} currency={context.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Revenue by Payment Method</h2>
              <ExportButton type="payment-methods" />
            </div>
            {byMethod.length === 0 ? (
              <p className="text-muted-foreground text-sm">No payments recorded for this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMethod.map((r) => (
                    <TableRow key={r.method}>
                      <TableCell className="font-medium capitalize">
                        {r.method.replaceAll("_", " ")}
                      </TableCell>
                      <TableCell>{r.count}</TableCell>
                      <TableCell>
                        <Money value={r.amount} currency={context.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="receivables" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <ReceivablesFilterBar />
            <ExportButton type="receivables" />
          </div>
          {receivables.rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nothing outstanding"
              description="No open invoices match these filters."
            />
          ) : (
            <Card className="gap-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Clinic</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Aging</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivables.rows.map((r) => (
                    <TableRow key={r.invoiceId}>
                      <TableCell className="font-medium">
                        <a href={`/invoices/${r.invoiceId}`} className="hover:underline">
                          {r.invoiceNumber ?? "Draft"}
                        </a>
                      </TableCell>
                      <TableCell>
                        <a href={`/patients/${r.patientId}`} className="hover:underline">
                          {r.patientName}
                        </a>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.clinicName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.dueDate ?? "—"}</TableCell>
                      <TableCell>
                        <Money value={r.total} currency={context.currency} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Money value={r.balance} currency={context.currency} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.agingBucket === "current"
                              ? "outline"
                              : r.agingBucket === "90_plus"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {agingBucketLabels[r.agingBucket]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                pageSize={25}
                total={receivables.total}
                buildHref={buildReceivablesHref}
              />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile
              label="Succeeded"
              icon={Wallet}
              value={String(paymentPerformance.succeededCount)}
            />
            <StatTile label="Failed" icon={Wallet} value={String(paymentPerformance.failedCount)} />
            <StatTile
              label="Pending"
              icon={Wallet}
              value={String(paymentPerformance.pendingCount)}
            />
            <StatTile
              label="Refunded"
              icon={RotateCcw}
              value={String(paymentPerformance.refundedCount)}
            />
          </div>
          <Card className="p-5">
            <p className="text-muted-foreground text-sm">
              Succeeded payment volume this period:{" "}
              <span className="text-foreground font-medium">
                <Money value={paymentPerformance.succeededAmount} currency={context.currency} />
              </span>
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="flex flex-col gap-4">
          <Card className="gap-0 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceStatus.map((r) => (
                  <TableRow key={r.status}>
                    <TableCell className="font-medium capitalize">
                      {r.status.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>{r.count}</TableCell>
                    <TableCell>
                      <Money value={r.total} currency={context.currency} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
