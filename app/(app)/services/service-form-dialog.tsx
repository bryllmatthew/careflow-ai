"use client";

import { useState, useTransition, type ReactNode } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { ServiceFormInput } from "@/lib/validation/service.schema";
import { createServiceAction, updateServiceAction } from "./actions";

const emptyValues: ServiceFormInput = {
  name: "",
  description: "",
  durationMinutes: 30,
  price: "0.00",
  cost: "",
  clinicId: "",
};

export function ServiceFormDialog({
  trigger,
  serviceId,
  initialValues,
  clinics,
}: {
  trigger: ReactNode;
  /** Omit to create a new service; pass an id to edit an existing one. */
  serviceId?: string;
  initialValues?: ServiceFormInput;
  clinics: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ServiceFormInput>(
    initialValues ?? { ...emptyValues, clinicId: clinics[0]?.id ?? "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isEdit = serviceId !== undefined;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(initialValues ?? { ...emptyValues, clinicId: clinics[0]?.id ?? "" });
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateServiceAction(serviceId, values)
        : await createServiceAction(values);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? "Service updated." : "Service created.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit service" : "Add service"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update this service's details." : "Add a bookable service to the catalogue."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="svc-name">Name</Label>
              <Input
                id="svc-name"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="svc-description">Description</Label>
              <Textarea
                id="svc-description"
                rows={2}
                value={values.description ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="svc-duration">Duration (min)</Label>
                <Input
                  id="svc-duration"
                  type="number"
                  min={1}
                  max={1440}
                  value={values.durationMinutes}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, durationMinutes: Number(e.target.value) }))
                  }
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="svc-price">Price</Label>
                <Input
                  id="svc-price"
                  inputMode="decimal"
                  value={values.price}
                  onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="svc-cost">Cost</Label>
                <Input
                  id="svc-cost"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={values.cost ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, cost: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="svc-clinic">Clinic</Label>
              <Select
                value={values.clinicId}
                onValueChange={(v) => setValues((s) => ({ ...s, clinicId: v }))}
              >
                <SelectTrigger id="svc-clinic" className="w-full">
                  <SelectValue placeholder="Select a clinic" />
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
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !values.clinicId}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
