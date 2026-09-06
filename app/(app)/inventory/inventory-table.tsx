import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockStatusBadge } from "@/components/patterns/stock-status-badge";
import { ExpirationBadge } from "@/components/patterns/expiration-badge";
import type { InventoryRow } from "./queries";

export function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Clinic</TableHead>
          <TableHead>On hand</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead>Reorder level</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Expiration</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">
              <Link href={`/products/${r.productId}`} className="hover:underline">
                {r.productName}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{r.sku ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{r.clinicName}</TableCell>
            <TableCell>{r.quantityOnHand}</TableCell>
            <TableCell className="text-muted-foreground">{r.unitOfMeasure}</TableCell>
            <TableCell className="text-muted-foreground">{r.reorderLevel}</TableCell>
            <TableCell>
              <StockStatusBadge status={r.status} />
            </TableCell>
            <TableCell>
              {r.trackExpiration ? <ExpirationBadge expirationDate={r.earliestExpiration} /> : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                new Date(r.updatedAt),
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
