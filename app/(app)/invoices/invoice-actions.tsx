"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Printer, Ban, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { toast } from "sonner";
import { cancelDraftInvoiceAction, issueInvoiceAction, voidInvoiceAction } from "./actions";

export function InvoiceActions({
  invoiceId,
  status,
  canIssue,
  canVoid,
  canUpdate,
}: {
  invoiceId: string;
  status: string;
  canIssue: boolean;
  canVoid: boolean;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function issue() {
    startTransition(async () => {
      const result = await issueInvoiceAction(invoiceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invoice issued.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && canIssue && (
        <Button size="sm" disabled={pending} onClick={issue}>
          <CheckCircle2 className="size-4" />
          Issue invoice
        </Button>
      )}

      {status === "draft" && canUpdate && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" disabled={pending}>
              <X className="size-4" />
              Discard draft
            </Button>
          }
          title="Discard this draft invoice?"
          description="This draft is cancelled and removed from active use. Nothing has been billed yet."
          confirmLabel="Discard draft"
          onConfirm={async () => {
            await cancelDraftInvoiceAction(invoiceId);
            toast.success("Draft discarded.");
            router.push("/invoices");
          }}
        />
      )}

      {["issued", "overdue", "partially_paid"].includes(status) && canVoid && (
        <VoidDialog invoiceId={invoiceId} />
      )}

      <Button asChild variant="outline" size="sm">
        <Link href={`/invoices/${invoiceId}/print`} target="_blank">
          <Printer className="size-4" />
          Print
        </Link>
      </Button>
    </div>
  );
}

function VoidDialog({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
      setError(null);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await voidInvoiceAction(invoiceId, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Invoice voided.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Ban className="size-4" />
          Void invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this invoice?</DialogTitle>
          <DialogDescription>
            The invoice stays in history -- it&apos;s marked void, not deleted. A reason is
            required.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea
            id="void-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={pending || !reason.trim()} onClick={submit}>
            {pending ? "Voiding…" : "Void invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
