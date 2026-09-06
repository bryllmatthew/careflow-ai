import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PurchaseOrderStatusBadge } from "@/components/patterns/purchase-order-status-badge";
import { Money } from "@/components/patterns/money";
import type { PurchaseOrderRow } from "./queries";

export function PurchaseOrdersTable({ purchaseOrders }: { purchaseOrders: PurchaseOrderRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PO #</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead>Clinic</TableHead>
          <TableHead>Order date</TableHead>
          <TableHead>Expected</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {purchaseOrders.map((po) => (
          <TableRow key={po.id}>
            <TableCell className="font-medium">
              <Link href={`/purchase-orders/${po.id}`} className="hover:underline">
                {po.purchaseOrderNumber ?? "Draft"}
              </Link>
            </TableCell>
            <TableCell>{po.supplierName}</TableCell>
            <TableCell className="text-muted-foreground">{po.clinicName ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {po.orderDate
                ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                    new Date(po.orderDate),
                  )
                : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {po.expectedDate
                ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                    new Date(po.expectedDate),
                  )
                : "—"}
            </TableCell>
            <TableCell>
              <Money value={po.total} />
            </TableCell>
            <TableCell>
              <PurchaseOrderStatusBadge status={po.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
