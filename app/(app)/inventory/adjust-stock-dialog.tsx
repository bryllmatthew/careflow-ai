"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageMinus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  adjustmentMovementTypes,
  adjustmentMovementTypeLabels,
  type AdjustmentMovementType,
} from "@/lib/validation/inventory.schema";
import { adjustInventoryAction, listBatchesForClinicProductAction } from "./actions";
import type { InventoryBatchRow } from "./queries";

const DECREASING_TYPES: AdjustmentMovementType[] = ["damaged", "expired", "return"];
const NO_BATCH = "none";

export function AdjustStockDialog({
  clinics,
  defaultClinicId,
  productId,
  productName,
  trackExpiration,
  trigger,
}: {
  clinics: { id: string; name: string }[];
  defaultClinicId?: string;
  productId: string;
  productName: string;
  trackExpiration: boolean;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clinicId, setClinicId] = useState(defaultClinicId ?? clinics[0]?.id ?? "");
  const [movementType, setMovementType] = useState<AdjustmentMovementType>("manual_adjustment");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [batchId, setBatchId] = useState<string>(NO_BATCH);
  const [batches, setBatches] = useState<InventoryBatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isDecreasingType = DECREASING_TYPES.includes(movementType);
  // Decreasing types (damaged/expired/return) only ever decrease stock --
  // the direction toggle is irrelevant for them, so it's overridden here at
  // the point of use rather than synced into state via an effect.
  const effectiveDirection = isDecreasingType ? "decrease" : direction;

  useEffect(() => {
    if (!open || !trackExpiration || !clinicId || effectiveDirection !== "decrease") {
      return;
    }
    let cancelled = false;
    listBatchesForClinicProductAction(clinicId, productId).then((rows) => {
      if (!cancelled) setBatches(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, trackExpiration, clinicId, effectiveDirection, productId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setClinicId(defaultClinicId ?? clinics[0]?.id ?? "");
      setMovementType("manual_adjustment");
      setDirection("decrease");
      setQuantity("");
      setReason("");
      setBatchId(NO_BATCH);
      setError(null);
    }
  }

  function submit() {
    setError(null);
    const magnitude = Number(quantity);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    const delta = effectiveDirection === "decrease" ? -magnitude : magnitude;

    startTransition(async () => {
      const result = await adjustInventoryAction({
        clinicId,
        productId,
        quantityDelta: String(delta),
        movementType,
        reason,
        batchId: batchId === NO_BATCH ? undefined : batchId,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Inventory adjusted.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Record a manual stock change for {productName}, with a reason.
          </DialogDescription>
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

          <div className="flex flex-col gap-1">
            <Label>Type</Label>
            <Select
              value={movementType}
              onValueChange={(v) => setMovementType(v as AdjustmentMovementType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adjustmentMovementTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {adjustmentMovementTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!isDecreasingType && (
              <div className="flex flex-col gap-1">
                <Label>Direction</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as "increase" | "decrease")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="decrease">Decrease</SelectItem>
                    <SelectItem value="increase">Increase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor="adjust-quantity">Quantity</Label>
              <Input
                id="adjust-quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          {trackExpiration && effectiveDirection === "decrease" && batches.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label>Batch (optional)</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BATCH}>Not batch-specific</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batchNumber ?? "No batch #"} · {b.quantityRemaining} remaining
                      {b.expirationDate ? ` · exp. ${b.expirationDate}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Textarea
              id="adjust-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant={isDecreasingType ? "destructive" : "default"}
            disabled={pending || !clinicId || !quantity.trim() || !reason.trim()}
            onClick={submit}
          >
            <PackageMinus className="size-4" />
            {pending ? "Saving…" : "Apply adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
