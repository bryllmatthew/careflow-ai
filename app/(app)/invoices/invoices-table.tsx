import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/patterns/invoice-status-badge";
import { Money } from "@/components/patterns/money";
import type { InvoiceRow } from "./queries";

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Clinic</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Paid</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell className="font-medium">
              <Link href={`/invoices/${inv.id}`} className="hover:underline">
                {inv.invoiceNumber ?? "Draft"}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {inv.issueDate
                ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                    new Date(inv.issueDate),
                  )
                : "—"}
            </TableCell>
            <TableCell>
              <Link href={`/patients/${inv.patientId}`} className="hover:underline">
                {inv.patientName}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{inv.clinicName ?? "—"}</TableCell>
            <TableCell>
              <Money value={inv.total} currency={inv.currency} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              <Money value={inv.amountPaid} currency={inv.currency} />
            </TableCell>
            <TableCell
              className={Number(inv.balance) > 0 ? "font-medium" : "text-muted-foreground"}
            >
              <Money value={inv.balance} currency={inv.currency} />
            </TableCell>
            <TableCell>
              <InvoiceStatusBadge status={inv.status} isOverdue={inv.isOverdue} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {inv.dueDate
                ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                    new Date(inv.dueDate),
                  )
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
