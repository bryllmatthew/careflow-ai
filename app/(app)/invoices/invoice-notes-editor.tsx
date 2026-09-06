"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { updateInvoiceDetailsAction } from "./actions";

export function InvoiceNotesEditor({
  invoiceId,
  dueDate,
  notes,
}: {
  invoiceId: string;
  dueDate: string | null;
  notes: string | null;
}) {
  const [due, setDue] = useState(dueDate ?? "");
  const [text, setText] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateInvoiceDetailsAction(invoiceId, { dueDate: due, notes: text });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-due-date" className="text-xs">
          Due date
        </Label>
        <Input
          id="edit-due-date"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="w-44"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-notes" className="text-xs">
          Notes
        </Label>
        <Textarea id="edit-notes" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={save}
        className="self-start"
      >
        Save
      </Button>
    </div>
  );
}
