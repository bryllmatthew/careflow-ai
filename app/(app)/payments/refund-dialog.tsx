"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { refundPaymentAction } from "./actions";

export function RefundDialog({
  paymentId,
  refundableAmount,
  currency,
}: {
  paymentId: string;
  refundableAmount: string;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(refundableAmount);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(refundableAmount);
      setReason("");
      setError(null);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await refundPaymentAction(paymentId, { amount, reason });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Refund recorded.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Undo2 className="size-4" />
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund this payment</DialogTitle>
          <DialogDescription>
            Recorded as a separate refund event -- the original payment record is never altered.
            Refundable:{" "}
            {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
              Number(refundableAmount),
            )}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="refund-amount">Amount</Label>
            <Input
              id="refund-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="refund-reason">Reason</Label>
            <Textarea
              id="refund-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || !amount.trim() || !reason.trim()}
            onClick={submit}
          >
            {pending ? "Refunding…" : "Refund payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
