import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentStatusBadge } from "@/components/patterns/payment-status-badge";
import { Money } from "@/components/patterns/money";
import { paymentMethodLabels, type PaymentMethod } from "@/lib/validation/payment.schema";
import type { PaymentRow } from "./queries";

export function PaymentsTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Clinic</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Refunded</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(p.createdAt))}
            </TableCell>
            <TableCell className="font-medium">
              <Link href={`/invoices/${p.invoiceId}`} className="hover:underline">
                {p.invoiceNumber ?? "Draft"}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/patients/${p.patientId}`} className="hover:underline">
                {p.patientName}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{p.clinicName ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {(p.paymentMethod as PaymentMethod) in paymentMethodLabels
                ? paymentMethodLabels[p.paymentMethod as PaymentMethod]
                : p.paymentMethod}
            </TableCell>
            <TableCell>
              <Money value={p.amount} currency={p.currency} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {Number(p.refundedAmount) > 0 ? (
                <Money value={p.refundedAmount} currency={p.currency} />
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>
              <PaymentStatusBadge status={p.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
