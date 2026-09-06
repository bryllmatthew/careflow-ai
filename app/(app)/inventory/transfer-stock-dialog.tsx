"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
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
import { transferInventoryAction } from "./actions";

export function TransferStockDialog({
  clinics,
  defaultFromClinicId,
  productId,
  productName,
  trigger,
}: {
  clinics: { id: string; name: string }[];
  defaultFromClinicId?: string;
  productId: string;
  productName: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromClinicId, setFromClinicId] = useState(defaultFromClinicId ?? clinics[0]?.id ?? "");
  const [toClinicId, setToClinicId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFromClinicId(defaultFromClinicId ?? clinics[0]?.id ?? "");
      setToClinicId("");
      setQuantity("");
      setNotes("");
      setError(null);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await transferInventoryAction({
        fromClinicId,
        toClinicId,
        productId,
        quantity,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Stock transferred.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer stock</DialogTitle>
          <DialogDescription>Move {productName} from one clinic to another.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>From clinic</Label>
              <Select value={fromClinicId} onValueChange={setFromClinicId}>
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
            <div className="flex flex-col gap-1">
              <Label>To clinic</Label>
              <Select value={toClinicId} onValueChange={setToClinicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  {clinics
                    .filter((c) => c.id !== fromClinicId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="transfer-quantity">Quantity</Label>
            <Input
              id="transfer-quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="transfer-notes">Notes (optional)</Label>
            <Input id="transfer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !fromClinicId || !toClinicId || !quantity.trim()}
            onClick={submit}
          >
            <ArrowRightLeft className="size-4" />
            {pending ? "Transferring…" : "Transfer stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
