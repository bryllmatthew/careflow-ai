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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLINIC_TYPES,
  CLINIC_TYPE_LABELS,
  TOOTH_NUMBERING_SYSTEMS,
  TOOTH_NUMBERING_LABELS,
  clinicHasCapability,
  type ClinicType,
  type ToothNumbering,
} from "@/lib/clinic-types";
import { toast } from "sonner";
import type { ClinicFormInput } from "@/lib/validation/clinic.schema";
import { createClinicAction, updateClinicAction } from "./actions";

type ClinicFormValues = ClinicFormInput;

function emptyValues(defaultClinicType: ClinicType): ClinicFormValues {
  return {
    name: "",
    address: "",
    phone: "",
    email: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    clinicType: defaultClinicType,
    toothNumbering: "fdi",
  };
}

export function ClinicFormDialog({
  trigger,
  clinicId,
  initialValues,
  defaultClinicType = "other",
}: {
  trigger: ReactNode;
  /** Omit to create a new clinic; pass an id to edit an existing one. */
  clinicId?: string;
  initialValues?: ClinicFormValues;
  /** A new clinic starts as the organization's own type -- most orgs are one kind. */
  defaultClinicType?: ClinicType;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ClinicFormValues>(
    initialValues ?? emptyValues(defaultClinicType),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isEdit = clinicId !== undefined;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(initialValues ?? emptyValues(defaultClinicType));
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateClinicAction(clinicId, values)
        : await createClinicAction(values);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? "Clinic updated." : "Clinic created.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit clinic" : "Add clinic"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update this clinic's details." : "Add a new branch to your organization."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="clinic-name">Name</Label>
              <Input
                id="clinic-name"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="clinic-address">Address</Label>
              <Input
                id="clinic-address"
                value={values.address ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="clinic-phone">Phone</Label>
                <Input
                  id="clinic-phone"
                  value={values.phone ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="clinic-email">Email</Label>
                <Input
                  id="clinic-email"
                  type="email"
                  value={values.email ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="clinic-timezone">Timezone</Label>
              <Input
                id="clinic-timezone"
                value={values.timezone}
                onChange={(e) => setValues((v) => ({ ...v, timezone: e.target.value }))}
                required
              />
              <p className="text-muted-foreground text-sm">
                An IANA timezone, e.g. Asia/Manila or America/New_York.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="clinic-type">Clinic type</Label>
              <Select
                value={values.clinicType}
                onValueChange={(v) => setValues((s) => ({ ...s, clinicType: v as ClinicType }))}
              >
                <SelectTrigger id="clinic-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLINIC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CLINIC_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-sm">
                Turns on tools for this kind of practice, such as tooth charting for dental clinics.
              </p>
            </div>

            {/* Only meaningful where there is a dental chart to number. */}
            {clinicHasCapability(values.clinicType, "dental") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="clinic-tooth-numbering">Tooth numbering</Label>
                <Select
                  value={values.toothNumbering}
                  onValueChange={(v) =>
                    setValues((s) => ({ ...s, toothNumbering: v as ToothNumbering }))
                  }
                >
                  <SelectTrigger id="clinic-tooth-numbering" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOOTH_NUMBERING_SYSTEMS.map((n) => (
                      <SelectItem key={n} value={n}>
                        {TOOTH_NUMBERING_LABELS[n]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-sm">
                  Changes how teeth are labelled on the chart. Existing records are unaffected.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create clinic"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
