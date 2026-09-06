"use client";

import { useEffect, useState, useTransition } from "react";
import { Boxes, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { ProductOption } from "../products/queries";
import type { ServiceSupplyRow } from "./queries";
import {
  addServiceSupplyAction,
  removeServiceSupplyAction,
  listServiceSuppliesAction,
} from "./actions";

export function ServiceSuppliesDialog({
  serviceId,
  serviceName,
  products,
  trigger,
}: {
  serviceId: string;
  serviceName: string;
  products: ProductOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // null (not []) distinguishes "not fetched yet" from "fetched, zero
  // supplies" -- loading is derived from this rather than a separate
  // setState call at the top of the effect.
  const [supplies, setSupplies] = useState<ServiceSupplyRow[] | null>(null);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pending, startTransition] = useTransition();
  const loading = open && supplies === null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listServiceSuppliesAction(serviceId).then((rows) => {
      if (!cancelled) setSupplies(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, serviceId]);

  function addSupply() {
    if (!productId || !quantity.trim()) return;
    startTransition(async () => {
      const result = await addServiceSupplyAction(serviceId, productId, quantity);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setProductId("");
      setQuantity("");
      setSupplies(await listServiceSuppliesAction(serviceId));
    });
  }

  function removeSupply(supplyId: string) {
    startTransition(async () => {
      try {
        await removeServiceSupplyAction(supplyId);
        setSupplies(await listServiceSuppliesAction(serviceId));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't remove this supply.");
      }
    });
  }

  const availableProducts = products.filter(
    (p) => p.trackInventory && !(supplies ?? []).some((s) => s.productId === p.id),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Required supplies</DialogTitle>
          <DialogDescription>
            Products automatically deducted from clinic inventory when a {serviceName} appointment
            is completed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (supplies ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No supplies required yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(supplies ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.productName}</TableCell>
                    <TableCell>
                      {s.quantity} {s.unitOfMeasure}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => removeSupply(s.id)}
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
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.unitOfMeasure})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Quantity per appointment</Label>
              <Input
                className="w-32"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pending || !productId || !quantity.trim()}
              onClick={addSupply}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {availableProducts.length === 0 && (supplies ?? []).length === 0 && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Boxes className="size-3.5" aria-hidden />
              No inventory-tracked products exist yet -- add one in Products first.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
