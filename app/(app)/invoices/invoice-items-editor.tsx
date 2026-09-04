"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
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
import type { InvoiceItemRow } from "./queries";
import { addInvoiceItemAction, removeInvoiceItemAction, updateInvoiceItemAction } from "./actions";

type ServiceOption = { id: string; name: string; price: string };

export function InvoiceItemsEditor({
  invoiceId,
  items,
  services,
  currency,
}: {
  invoiceId: string;
  items: InvoiceItemRow[];
  services: ServiceOption[];
  currency: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="w-24">Qty</TableHead>
            <TableHead className="w-32">Unit Price</TableHead>
            <TableHead className="w-32">Total</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground text-center">
                No items yet. Add a service or a custom line below.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) =>
              editingId === item.id ? (
                <ItemEditRow
                  key={item.id}
                  invoiceId={invoiceId}
                  item={item}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>
                    <Money value={item.unitPrice} currency={currency} />
                  </TableCell>
                  <TableCell>
                    <Money value={item.lineTotal} currency={currency} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditingId(item.id)}
                        aria-label="Edit line"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await removeInvoiceItemAction(item.id, invoiceId);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Couldn't remove line.");
                            }
                          })
                        }
                        aria-label="Remove line"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )
          )}
        </TableBody>
      </Table>

      <AddItemForm invoiceId={invoiceId} services={services} />
    </div>
  );
}

function ItemEditRow({
  invoiceId,
  item,
  onDone,
}: {
  invoiceId: string;
  item: InvoiceItemRow;
  onDone: () => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unitPrice, setUnitPrice] = useState(item.unitPrice);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateInvoiceItemAction(item.id, invoiceId, {
        serviceId: item.serviceId ?? undefined,
        description,
        quantity: Number(quantity),
        unitPrice,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="w-28" />
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">Recalculated on save</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={pending} onClick={save} aria-label="Save">
            <Pencil className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDone} aria-label="Cancel edit">
            <X className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AddItemForm({ invoiceId, services }: { invoiceId: string; services: ServiceOption[] }) {
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [pending, startTransition] = useTransition();

  function pickService(id: string) {
    setServiceId(id);
    const service = services.find((s) => s.id === id);
    if (service) {
      setDescription(service.name);
      setUnitPrice(service.price);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addInvoiceItemAction(invoiceId, {
        serviceId: serviceId || undefined,
        description,
        quantity: Number(quantity),
        unitPrice,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setServiceId("");
      setDescription("");
      setQuantity("1");
      setUnitPrice("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
      {services.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="item-service" className="text-xs">
            Service
          </Label>
          <Select value={serviceId || "custom"} onValueChange={(v) => pickService(v === "custom" ? "" : v)}>
            <SelectTrigger id="item-service" className="w-40">
              <SelectValue placeholder="Custom line" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom line</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="item-description" className="text-xs">
          Description
        </Label>
        <Input
          id="item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="item-qty" className="text-xs">
          Qty
        </Label>
        <Input
          id="item-qty"
          type="number"
          min="0.01"
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="item-price" className="text-xs">
          Unit price
        </Label>
        <Input
          id="item-price"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="w-28"
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="size-4" />
        Add
      </Button>
    </form>
  );
}
