"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { suggestedProductCategories, type ProductFormInput } from "@/lib/validation/product.schema";
import type { ProductRow } from "./queries";
import { createProductAction, updateProductAction } from "./actions";

const NO_SUPPLIER = "none";

function emptyForm(): ProductFormInput {
  return {
    name: "",
    sku: undefined,
    barcode: undefined,
    description: undefined,
    category: undefined,
    brand: undefined,
    unitOfMeasure: "unit",
    unitCost: "0.00",
    sellingPrice: undefined,
    trackInventory: true,
    trackExpiration: false,
    reorderLevel: "0",
    reorderQuantity: "0",
    supplierId: undefined,
    supplierSku: undefined,
  };
}

function fromRow(p: ProductRow): ProductFormInput {
  return {
    name: p.name,
    sku: p.sku ?? undefined,
    barcode: p.barcode ?? undefined,
    description: undefined,
    category: p.category ?? undefined,
    brand: p.brand ?? undefined,
    unitOfMeasure: p.unitOfMeasure,
    unitCost: p.unitCost,
    sellingPrice: p.sellingPrice ?? undefined,
    trackInventory: p.trackInventory,
    trackExpiration: p.trackExpiration,
    reorderLevel: p.reorderLevel,
    reorderQuantity: p.reorderQuantity,
    supplierId: p.supplierId ?? undefined,
    supplierSku: p.supplierSku ?? undefined,
  };
}

export function ProductFormDialog({
  product,
  suppliers,
  trigger,
}: {
  product?: ProductRow;
  suppliers: { id: string; name: string }[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductFormInput>(product ? fromRow(product) : emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setForm(product ? fromRow(product) : emptyForm());
      setError(null);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      if (product) {
        const result = await updateProductAction(product.id, form);
        if (result.error) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createProductAction(form);
        if (!result.success) {
          setError(result.error);
          return;
        }
      }
      toast.success(product ? "Product updated." : "Product created.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            {product
              ? "Update this product's catalogue details."
              : "Add a product to the catalogue."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="product-sku">SKU</Label>
              <Input
                id="product-sku"
                value={form.sku ?? ""}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="product-barcode">Barcode</Label>
              <Input
                id="product-barcode"
                value={form.barcode ?? ""}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="product-category">Category</Label>
              <Input
                id="product-category"
                list="product-category-suggestions"
                value={form.category ?? ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Medical Supplies"
              />
              <datalist id="product-category-suggestions">
                {suggestedProductCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="product-brand">Brand</Label>
              <Input
                id="product-brand"
                value={form.brand ?? ""}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="product-unit">Unit</Label>
              <Input
                id="product-unit"
                value={form.unitOfMeasure}
                onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
                placeholder="box, ml, piece…"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="product-cost">Unit cost</Label>
              <Input
                id="product-cost"
                value={form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="product-price">Selling price</Label>
              <Input
                id="product-price"
                value={form.sellingPrice ?? ""}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Preferred supplier</Label>
            <Select
              value={form.supplierId ?? NO_SUPPLIER}
              onValueChange={(v) =>
                setForm({ ...form, supplierId: v === NO_SUPPLIER ? undefined : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>No preferred supplier</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="track-inventory">Track inventory</Label>
              <p className="text-muted-foreground text-xs">
                Stock levels are tracked per clinic for this product.
              </p>
            </div>
            <Switch
              id="track-inventory"
              checked={form.trackInventory}
              onCheckedChange={(v) => setForm({ ...form, trackInventory: v })}
            />
          </div>

          {form.trackInventory && (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="track-expiration">Track expiration / batches</Label>
                  <p className="text-muted-foreground text-xs">
                    Receiving stock will ask for a batch and expiration date.
                  </p>
                </div>
                <Switch
                  id="track-expiration"
                  checked={form.trackExpiration}
                  onCheckedChange={(v) => setForm({ ...form, trackExpiration: v })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reorder-level">Reorder level (default)</Label>
                  <Input
                    id="reorder-level"
                    value={form.reorderLevel}
                    onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reorder-quantity">Reorder quantity (default)</Label>
                  <Input
                    id="reorder-quantity"
                    value={form.reorderQuantity}
                    onChange={(e) => setForm({ ...form, reorderQuantity: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={pending || !form.name.trim()} onClick={submit}>
            {pending ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
