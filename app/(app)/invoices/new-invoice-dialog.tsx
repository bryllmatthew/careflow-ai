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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { createInvoiceAction } from "./actions";
import { PatientPicker } from "../appointments/patient-picker";

export function NewInvoiceDialog({
  trigger,
  clinics,
  defaultPatient,
  defaultClinicId,
}: {
  trigger: ReactNode;
  clinics: { id: string; name: string }[];
  defaultPatient?: { id: string; name: string };
  defaultClinicId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(
    defaultPatient ?? null,
  );
  const [clinicId, setClinicId] = useState(defaultClinicId ?? clinics[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPatient(defaultPatient ?? null);
      setClinicId(defaultClinicId ?? clinics[0]?.id ?? "");
      setDueDate("");
      setNotes("");
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patient) {
      setError("Select a patient.");
      return;
    }
    startTransition(async () => {
      const result = await createInvoiceAction({
        patientId: patient.id,
        clinicId,
        appointmentId: undefined,
        dueDate,
        notes,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Draft invoice created.");
      router.push(`/invoices/${result.invoiceId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
            <DialogDescription>
              Start a draft invoice. You&apos;ll add line items on the next screen.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label>Patient</Label>
              <PatientPicker value={patient} onChange={setPatient} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-clinic">Clinic</Label>
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger id="inv-clinic" className="w-full">
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
              <Label htmlFor="inv-due">Due date</Label>
              <Input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea
                id="inv-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !clinicId}>
              {pending ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
