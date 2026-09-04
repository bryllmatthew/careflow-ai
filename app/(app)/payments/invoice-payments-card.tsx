import Link from "next/link";
import { Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/patterns/money";
import { PaymentStatusBadge } from "@/components/patterns/payment-status-badge";
import { paymentMethodLabels, type PaymentMethod } from "@/lib/validation/payment.schema";
import { listInvoicePayments } from "./queries";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { OnlinePaymentButton } from "./online-payment-button";
import { RefundDialog } from "./refund-dialog";

const REFUNDABLE_STATUSES = new Set(["succeeded", "partially_refunded"]);
const RECEIPTABLE_STATUSES = new Set(["succeeded", "partially_refunded", "refunded"]);
const OPEN_INVOICE_STATUSES = new Set(["issued", "overdue", "partially_paid"]);

export async function InvoicePaymentsCard({
  invoiceId,
  invoiceStatus,
  balance,
  currency,
  canRecordManual,
  canProcess,
  canRefund,
}: {
  invoiceId: string;
  invoiceStatus: string;
  balance: string;
  currency: string;
  canRecordManual: boolean;
  canProcess: boolean;
  canRefund: boolean;
}) {
  const payments = await listInvoicePayments(invoiceId);
  const isOpen = OPEN_INVOICE_STATUSES.has(invoiceStatus) && Number(balance) > 0;

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Payments</h2>
        {isOpen && (
          <div className="flex flex-wrap gap-2">
            {canProcess && <OnlinePaymentButton invoiceId={invoiceId} />}
            {canRecordManual && <RecordPaymentDialog invoiceId={invoiceId} balance={balance} currency={currency} />}
          </div>
        )}
      </div>

      {payments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No payments recorded yet.</p>
      ) : (
        <>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Refunded</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const refundable = (Number(p.amount) - Number(p.refundedAmount)).toFixed(2);
                const canRefundThis = canRefund && p.provider === "manual" && REFUNDABLE_STATUSES.has(p.status) && Number(refundable) > 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                        new Date(p.createdAt),
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(p.paymentMethod as PaymentMethod) in paymentMethodLabels
                        ? paymentMethodLabels[p.paymentMethod as PaymentMethod]
                        : p.paymentMethod}
                    </TableCell>
                    <TableCell>
                      <Money value={p.amount} currency={currency} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {Number(p.refundedAmount) > 0 ? <Money value={p.refundedAmount} currency={currency} /> : "—"}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.referenceNumber ?? p.providerTransactionId ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {RECEIPTABLE_STATUSES.has(p.status) && (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/payments/${p.id}/receipt`} target="_blank">
                              <Receipt className="size-4" />
                            </Link>
                          </Button>
                        )}
                        {canRefundThis && (
                          <RefundDialog paymentId={p.id} refundableAmount={refundable} currency={currency} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </Card>
  );
}
