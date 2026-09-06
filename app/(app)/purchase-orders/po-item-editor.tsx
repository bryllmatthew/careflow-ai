"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Money } from "@/components/patterns/money";
import { toast } from "sonner";
import type { ProductOption } from "../products/queries";
import type { PurchaseOrderItemRow } from "./queries";
import { addPurchaseOrderItemAction, removePurchaseOrderItemAction } from "./actions";

export function PoItemEditor({
  purchaseOrderId,
  items,
  products,
}: {
  purchaseOrderId: string;
  items: PurchaseOrderItemRow[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedProduct = products.find((p) => p.id === productId);

  function addItem() {
    if (!selectedProduct) return;
    startTransition(async () => {
      const result = await addPurchaseOrderItemAction(purchaseOrderId, {
        productId,
        description: selectedProduct.name,
        quantityOrdered: quantity,
        unitCost: unitCost || selectedProduct.unitCost,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setProductId("");
      setQuantity("");
      setUnitCost("");
      router.refresh();
    });
  }

  function removeItem(itemId: string) {
    startTransition(async () => {
      try {
        await removePurchaseOrderItemAction(itemId, purchaseOrderId);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't remove this line.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Ordered</TableHead>
              <TableHead>Unit cost</TableHead>
              <TableHead>Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.description}</TableCell>
                <TableCell>{item.quantityOrdered}</TableCell>
                <TableCell>
                  <Money value={item.unitCost} />
                </TableCell>
                <TableCell>
                  <Money value={item.totalCost} />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Product</Label>
          <Select
            value={productId}
            onValueChange={(v) => {
              setProductId(v);
              const p = products.find((x) => x.id === v);
              if (p) setUnitCost(p.unitCost);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Quantity</Label>
          <Input className="w-28" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Unit cost</Label>
          <Input className="w-28" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !productId || !quantity.trim()}
          onClick={addItem}
        >
          <Plus className="size-4" />
          Add line
        </Button>
      </div>
    </div>
  );
}
