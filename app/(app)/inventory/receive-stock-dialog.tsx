"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { receiveStockAction } from "./actions";

export function ReceiveStockDialog({
  clinics,
  defaultClinicId,
  productId,
  productName,
  unitCost,
  trackExpiration,
  trigger,
}: {
  clinics: { id: string; name: string }[];
  defaultClinicId?: string;
  productId: string;
  productName: string;
  unitCost: string;
  trackExpiration: boolean;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clinicId, setClinicId] = useState(defaultClinicId ?? clinics[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState(unitCost);
  const [batchNumber, setBatchNumber] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setClinicId(defaultClinicId ?? clinics[0]?.id ?? "");
      setQuantity("");
      setCost(unitCost);
      setBatchNumber("");
      setLotNumber("");
      setExpirationDate("");
      setNotes("");
      setError(null);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await receiveStockAction({
        clinicId,
        productId,
        quantity,
        unitCost: cost || undefined,
        batchNumber: batchNumber || undefined,
        lotNumber: lotNumber || undefined,
        expirationDate: expirationDate || undefined,
        notes: notes || undefined,
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>Record stock received for {productName}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1">
            <Label>Clinic</Label>
            <Select value={clinicId} onValueChange={setClinicId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clinics.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="receive-quantity">Quantity</Label>
              <Input
                id="receive-quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="receive-cost">Unit cost</Label>
              <Input id="receive-cost" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          {trackExpiration && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="receive-batch">Batch number</Label>
                <Input
                  id="receive-batch"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="receive-lot">Lot number</Label>
                <Input
                  id="receive-lot"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <Label htmlFor="receive-expiration">Expiration date</Label>
                <Input
                  id="receive-expiration"
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="receive-notes">Notes (optional)</Label>
            <Input id="receive-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={pending || !clinicId || !quantity.trim()} onClick={submit}>
            <PackagePlus className="size-4" />
            {pending ? "Receiving…" : "Receive stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
