import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/patterns/money";
import type { ProductRow } from "./queries";

export function ProductsTable({ products }: { products: ProductRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Selling price</TableHead>
          <TableHead>Tracking</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">
              <Link href={`/products/${p.id}`} className="hover:underline">
                {p.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{p.sku ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{p.brand ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{p.unitOfMeasure}</TableCell>
            <TableCell>
              <Money value={p.unitCost} currency={p.currency} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {p.sellingPrice ? <Money value={p.sellingPrice} currency={p.currency} /> : "—"}
            </TableCell>
            <TableCell>
              {p.trackInventory ? (
                <Badge variant="outline">
                  {p.trackExpiration ? "Stock + expiration" : "Stock"}
                </Badge>
              ) : (
                <Badge variant="outline">Not tracked</Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={p.status === "active" ? "default" : "secondary"}>
                {p.status === "active" ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
