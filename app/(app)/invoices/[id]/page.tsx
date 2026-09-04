import { notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { InvoiceStatusBadge } from "@/components/patterns/invoice-status-badge";
import { Money } from "@/components/patterns/money";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInvoiceById } from "../queries";
import { listServiceOptions } from "../../services/queries";
import { InvoiceItemsEditor } from "../invoice-items-editor";
import { InvoiceDiscountTaxEditor } from "../invoice-discount-tax-editor";
import { InvoiceActions } from "../invoice-actions";
import { InvoiceNotesEditor } from "../invoice-notes-editor";
import { InvoicePaymentsCard } from "../../payments/invoice-payments-card";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  // No requirePermission() gate -- the RLS-backed getInvoiceById() query is
  // the access check itself, same reasoning as the patient profile page.
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const [services, canUpdate, canIssue, canVoid, canApplyDiscount, canRecordManual, canProcess, canRefund] =
    await Promise.all([
      listServiceOptions(organizationId),
      can("invoices.update", { organizationId, clinicId: invoice.clinicId }),
      can("invoices.issue", { organizationId, clinicId: invoice.clinicId }),
      can("invoices.void", { organizationId, clinicId: invoice.clinicId }),
      can("invoices.apply_discount", { organizationId, clinicId: invoice.clinicId }),
      can("payments.record_manual", { organizationId, clinicId: invoice.clinicId }),
      can("payments.process", { organizationId, clinicId: invoice.clinicId }),
      can("payments.refund", { organizationId, clinicId: invoice.clinicId }),
    ]);

  const isDraft = invoice.status === "draft";
  const servicesForClinic = services
    .filter((s) => s.clinicId === invoice.clinicId)
    .map((s) => ({ id: s.id, name: s.name, price: s.price }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={invoice.invoiceNumber ?? "Draft invoice"}
        description={`${invoice.patientName} · ${invoice.clinicName ?? "Unknown clinic"}`}
        actions={
          <InvoiceActions
            invoiceId={invoice.id}
            status={invoice.status}
            canIssue={canIssue}
            canVoid={canVoid}
            canUpdate={canUpdate}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <InvoiceStatusBadge status={invoice.status} isOverdue={invoice.isOverdue} />
                <span className="text-muted-foreground">
                  Issued{" "}
                  {invoice.issueDate
                    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(invoice.issueDate))
                    : "—"}
                </span>
                <span className="text-muted-foreground">
                  Due{" "}
                  {invoice.dueDate
                    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(invoice.dueDate))
                    : "—"}
                </span>
              </div>
              <Link href={`/patients/${invoice.patientId}`} className="text-primary text-sm hover:underline">
                View patient profile
              </Link>
            </div>

            {invoice.voidReason && (
              <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                <span className="font-medium">Voided</span>
                {invoice.voidedAt &&
                  ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(invoice.voidedAt))}`}
                <p>{invoice.voidReason}</p>
              </div>
            )}

            <Separator />

            <h2 className="text-sm font-medium">Items</h2>
            {isDraft ? (
              <InvoiceItemsEditor
                invoiceId={invoice.id}
                items={invoice.items}
                services={servicesForClinic}
                currency={invoice.currency}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        <Money value={item.unitPrice} currency={invoice.currency} />
                      </TableCell>
                      <TableCell>
                        <Money value={item.lineTotal} currency={invoice.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {isDraft && (canUpdate || canApplyDiscount) && (
            <Card className="gap-3 p-5">
              <h2 className="text-sm font-medium">Discount &amp; tax</h2>
              <InvoiceDiscountTaxEditor
                invoiceId={invoice.id}
                discountType={invoice.discountType}
                discountValue={invoice.discountValue}
                taxRate={invoice.taxRate}
                canApplyDiscount={canApplyDiscount}
                canEditTax={canUpdate}
              />
            </Card>
          )}

          {isDraft && canUpdate && (
            <Card className="gap-3 p-5">
              <h2 className="text-sm font-medium">Details</h2>
              <InvoiceNotesEditor invoiceId={invoice.id} dueDate={invoice.dueDate} notes={invoice.notes} />
            </Card>
          )}

          {!isDraft && invoice.notes && (
            <Card className="gap-2 p-5">
              <h2 className="text-sm font-medium">Notes</h2>
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </Card>
          )}

          {!isDraft && (
            <InvoicePaymentsCard
              invoiceId={invoice.id}
              invoiceStatus={invoice.status}
              balance={invoice.balance}
              currency={invoice.currency}
              canRecordManual={canRecordManual}
              canProcess={canProcess}
              canRefund={canRefund}
            />
          )}
        </div>

        <Card className="h-fit gap-2 p-5">
          <h2 className="mb-1 text-sm font-medium">Summary</h2>
          <SummaryRow label="Subtotal" value={invoice.subtotal} currency={invoice.currency} />
          {Number(invoice.discountAmount) > 0 && (
            <SummaryRow label="Discount" value={`-${invoice.discountAmount}`} currency={invoice.currency} negative />
          )}
          {Number(invoice.taxAmount) > 0 && (
            <SummaryRow label={`Tax (${invoice.taxRate}%)`} value={invoice.taxAmount} currency={invoice.currency} />
          )}
          <Separator className="my-1" />
          <SummaryRow label="Total" value={invoice.total} currency={invoice.currency} emphasize />
          <SummaryRow label="Amount paid" value={invoice.amountPaid} currency={invoice.currency} />
          <Separator className="my-1" />
          <SummaryRow label="Balance due" value={invoice.balance} currency={invoice.currency} emphasize />
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  currency,
  emphasize,
  negative,
}: {
  label: string;
  value: string;
  currency: string;
  emphasize?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasize ? "text-base font-semibold" : negative ? "text-destructive" : undefined}>
        {negative ? (
          <span className="tabular-nums">
            -<Money value={value.replace("-", "")} currency={currency} />
          </span>
        ) : (
          <Money value={value} currency={currency} />
        )}
      </span>
    </div>
  );
}
