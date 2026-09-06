"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { PurchaseOrderItemRow } from "./queries";
import { receivePurchaseOrderItemAction } from "./actions";

export function ReceivePoItemDialog({
  purchaseOrderId,
  item,
  trackExpiration,
}: {
  purchaseOrderId: string;
  item: PurchaseOrderItemRow;
  trackExpiration: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remaining = (Number(item.quantityOrdered) - Number(item.quantityReceived)).toString();
  const [quantity, setQuantity] = useState(remaining);
  const [batchNumber, setBatchNumber] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuantity(remaining);
      setBatchNumber("");
      setLotNumber("");
      setExpirationDate("");
      setError(null);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await receivePurchaseOrderItemAction(item.id, purchaseOrderId, {
        quantity,
        batchNumber: batchNumber || undefined,
        lotNumber: lotNumber || undefined,
        expirationDate: expirationDate || undefined,
        notes: undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Stock received.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PackageCheck className="size-4" />
          Receive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive {item.description}</DialogTitle>
          <DialogDescription>
            {item.quantityReceived} of {item.quantityOrdered} received so far.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="receive-po-quantity">Quantity received now</Label>
            <Input
              id="receive-po-quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          {trackExpiration && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="receive-po-batch">Batch number</Label>
                  <Input
                    id="receive-po-batch"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="receive-po-lot">Lot number</Label>
                  <Input
                    id="receive-po-lot"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="receive-po-expiration">Expiration date</Label>
                <Input
                  id="receive-po-expiration"
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button disabled={pending || !quantity.trim()} onClick={submit}>
            {pending ? "Receiving…" : "Receive stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
