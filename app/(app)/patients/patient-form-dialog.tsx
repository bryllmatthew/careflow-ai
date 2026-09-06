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
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { PatientFormInput } from "@/lib/validation/patient.schema";
import { patientGenders, genderLabels } from "@/lib/validation/patient.schema";
import { createPatientAction, updatePatientAction, type DuplicateMatch } from "./actions";

const emptyValues: PatientFormInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  gender: undefined,
  address: "",
  notes: "",
  clinicId: "",
  assignedStaffId: "",
};

export function PatientFormDialog({
  trigger,
  patientId,
  initialValues,
  clinics,
  practitioners,
}: {
  trigger: ReactNode;
  /** Omit to create a new patient; pass an id to edit an existing one. */
  patientId?: string;
  initialValues?: PatientFormInput;
  clinics: { id: string; name: string }[];
  practitioners: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PatientFormInput>(
    initialValues ?? { ...emptyValues, clinicId: clinics[0]?.id ?? "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [pending, startTransition] = useTransition();

  const isEdit = patientId !== undefined;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(initialValues ?? { ...emptyValues, clinicId: clinics[0]?.id ?? "" });
      setError(null);
      setDuplicates(null);
    }
  }

  function submit(confirmedDuplicates: boolean) {
    setError(null);
    startTransition(async () => {
      if (isEdit) {
        const result = await updatePatientAction(patientId, values);
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success("Patient updated.");
        setOpen(false);
        return;
      }

      const result = await createPatientAction(values, { confirmedDuplicates });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.duplicates && result.duplicates.length > 0) {
        setDuplicates(result.duplicates);
        return;
      }
      toast.success("Patient created.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {duplicates ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-warning size-5" aria-hidden />
                <DialogTitle>Possible duplicate patient</DialogTitle>
              </div>
              <DialogDescription>
                Someone matching this name, phone or email is already registered. Create a new
                record only if you&apos;re sure this is a different person.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 py-2">
              {duplicates.map((d) => (
                <div key={d.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">
                    {d.firstName} {d.lastName}
                  </p>
                  <p className="text-muted-foreground">
                    {[d.phone, d.email].filter(Boolean).join(" · ") || "No contact info on file"}
                  </p>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setDuplicates(null)} disabled={pending}>
                Go back
              </Button>
              <Button onClick={() => submit(true)} disabled={pending}>
                {pending ? "Creating…" : "Create new patient anyway"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>{isEdit ? "Edit patient" : "Add patient"}</DialogTitle>
              <DialogDescription>
                {isEdit ? "Update this patient's information." : "Register a new patient."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-first-name">First name</Label>
                  <Input
                    id="p-first-name"
                    value={values.firstName}
                    onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-last-name">Last name</Label>
                  <Input
                    id="p-last-name"
                    value={values.lastName}
                    onChange={(e) => setValues((v) => ({ ...v, lastName: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-phone">Phone</Label>
                  <Input
                    id="p-phone"
                    value={values.phone ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-email">Email</Label>
                  <Input
                    id="p-email"
                    type="email"
                    value={values.email ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-dob">Date of birth</Label>
                  <Input
                    id="p-dob"
                    type="date"
                    value={values.dateOfBirth ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-gender">Gender</Label>
                  <Select
                    value={values.gender ?? "unspecified"}
                    onValueChange={(v) =>
                      setValues((s) => ({
                        ...s,
                        gender: v === "unspecified" ? undefined : (v as PatientFormInput["gender"]),
                      }))
                    }
                  >
                    <SelectTrigger id="p-gender" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unspecified">Not specified</SelectItem>
                      {patientGenders.map((g) => (
                        <SelectItem key={g} value={g}>
                          {genderLabels[g]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="p-address">Address</Label>
                <Input
                  id="p-address"
                  value={values.address ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-clinic">Primary clinic</Label>
                  <Select
                    value={values.clinicId}
                    onValueChange={(v) => setValues((s) => ({ ...s, clinicId: v }))}
                  >
                    <SelectTrigger id="p-clinic" className="w-full">
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p-practitioner">Assigned practitioner</Label>
                  <Select
                    value={values.assignedStaffId || "unassigned"}
                    onValueChange={(v) =>
                      setValues((s) => ({ ...s, assignedStaffId: v === "unassigned" ? "" : v }))
                    }
                  >
                    <SelectTrigger id="p-practitioner" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {practitioners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="p-notes">Notes</Label>
                <Textarea
                  id="p-notes"
                  rows={3}
                  value={values.notes ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={pending || !values.clinicId}>
                {pending ? "Saving…" : isEdit ? "Save changes" : "Create patient"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
