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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { SupplierFormInput } from "@/lib/validation/supplier.schema";
import type { SupplierRow } from "./queries";
import { createSupplierAction, updateSupplierAction } from "./actions";

function emptyForm(): SupplierFormInput {
  return {
    name: "",
    contactPerson: undefined,
    email: undefined,
    phone: undefined,
    address: undefined,
    notes: undefined,
  };
}

function fromRow(s: SupplierRow): SupplierFormInput {
  return {
    name: s.name,
    contactPerson: s.contactPerson ?? undefined,
    email: s.email ?? undefined,
    phone: s.phone ?? undefined,
    address: s.address ?? undefined,
    notes: s.notes ?? undefined,
  };
}

export function SupplierFormDialog({
  supplier,
  trigger,
}: {
  supplier?: SupplierRow;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplierFormInput>(supplier ? fromRow(supplier) : emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setForm(supplier ? fromRow(supplier) : emptyForm());
      setError(null);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      if (supplier) {
        const result = await updateSupplierAction(supplier.id, form);
        if (result.error) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createSupplierAction(form);
        if (!result.success) {
          setError(result.error);
          return;
        }
      }
      toast.success(supplier ? "Supplier updated." : "Supplier created.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "New supplier"}</DialogTitle>
          <DialogDescription>
            {supplier
              ? "Update this supplier's details."
              : "Add a supplier for purchase orders and reordering."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="supplier-name">Name</Label>
            <Input
              id="supplier-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="supplier-contact">Contact person</Label>
              <Input
                id="supplier-contact"
                value={form.contactPerson ?? ""}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input
                id="supplier-phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="supplier-email">Email</Label>
            <Input
              id="supplier-email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="supplier-address">Address</Label>
            <Textarea
              id="supplier-address"
              rows={2}
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="supplier-notes">Notes</Label>
            <Textarea
              id="supplier-notes"
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={pending || !form.name.trim()} onClick={submit}>
            {pending ? "Saving…" : supplier ? "Save changes" : "Create supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
