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
import {
  followUpTypes,
  followUpTypeLabels,
  followUpPriorities,
  followUpPriorityLabels,
} from "@/lib/validation/followup.schema";
import type { FollowUpFormInput } from "@/lib/validation/followup.schema";
import { createFollowUpAction } from "./actions";
import { PatientPicker } from "../appointments/patient-picker";

function tomorrowLocal(): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    time: "09:00",
  };
}

export function FollowUpFormDialog({
  trigger,
  clinics,
  staff,
  defaultPatient,
  defaultClinicId,
}: {
  trigger: ReactNode;
  clinics: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  defaultPatient?: { id: string; name: string };
  defaultClinicId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(
    defaultPatient ?? null,
  );
  const [clinicId, setClinicId] = useState(defaultClinicId ?? clinics[0]?.id ?? "");
  const [type, setType] = useState<FollowUpFormInput["type"]>("general");
  const [priority, setPriority] = useState<FollowUpFormInput["priority"]>("normal");
  const [{ date, time }, setDateTime] = useState(tomorrowLocal());
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPatient(defaultPatient ?? null);
      setClinicId(defaultClinicId ?? clinics[0]?.id ?? "");
      setType("general");
      setPriority("normal");
      setDateTime(tomorrowLocal());
      setAssignedTo("");
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
    const dueAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(dueAt.getTime())) {
      setError("Enter a valid due date and time.");
      return;
    }

    startTransition(async () => {
      const result = await createFollowUpAction({
        patientId: patient.id,
        clinicId,
        type,
        priority,
        dueAt: dueAt.toISOString(),
        assignedTo: assignedTo || undefined,
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Follow-up created.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add follow-up</DialogTitle>
            <DialogDescription>Create an operational follow-up task.</DialogDescription>
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
              <Label htmlFor="fu-clinic">Clinic</Label>
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger id="fu-clinic" className="w-full">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fu-type">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as FollowUpFormInput["type"])}>
                  <SelectTrigger id="fu-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {followUpTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {followUpTypeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fu-priority">Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as FollowUpFormInput["priority"])}
                >
                  <SelectTrigger id="fu-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {followUpPriorities.map((p) => (
                      <SelectItem key={p} value={p}>
                        {followUpPriorityLabels[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fu-date">Due date</Label>
                <Input
                  id="fu-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDateTime((s) => ({ ...s, date: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fu-time">Due time</Label>
                <Input
                  id="fu-time"
                  type="time"
                  value={time}
                  onChange={(e) => setDateTime((s) => ({ ...s, time: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="fu-assigned">Assign to</Label>
              <Select
                value={assignedTo || "unassigned"}
                onValueChange={(v) => setAssignedTo(v === "unassigned" ? "" : v)}
              >
                <SelectTrigger id="fu-assigned" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="fu-notes">Notes</Label>
              <Textarea
                id="fu-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !clinicId}>
              {pending ? "Creating…" : "Create follow-up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
