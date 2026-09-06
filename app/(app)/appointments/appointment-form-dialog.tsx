"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
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
import { Money } from "@/components/patterns/money";
import { toast } from "sonner";
import { createAppointmentAction } from "./actions";
import { PatientPicker } from "./patient-picker";

type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  price: string;
  clinicId: string;
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextHalfHourLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AppointmentFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  clinics,
  practitioners,
  services,
  defaultPatient,
  defaultClinicId,
  defaultStaffId,
  defaultDate,
  defaultTime,
}: {
  /** Omit for the usual trigger-opened dialog (uncontrolled). Pass both open
   * and onOpenChange to drive it externally instead -- the calendar's
   * click-to-create uses this to open one shared instance with per-cell
   * defaults, rather than mounting a trigger per grid cell. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  clinics: { id: string; name: string }[];
  practitioners: { id: string; name: string }[];
  services: ServiceOption[];
  /** Pre-fills the patient (e.g. booking from the patient's own profile) and skips the picker. */
  defaultPatient?: { id: string; name: string };
  defaultClinicId?: string;
  defaultStaffId?: string;
  defaultDate?: string;
  defaultTime?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChangeProp ?? setOpenState;

  const [patient, setPatient] = useState<{ id: string; name: string } | null>(
    defaultPatient ?? null,
  );
  const [clinicId, setClinicId] = useState(defaultClinicId ?? clinics[0]?.id ?? "");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState(defaultStaffId ?? "");
  const [date, setDate] = useState(defaultDate ?? todayLocal());
  const [time, setTime] = useState(defaultTime ?? nextHalfHourLocal());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const servicesForClinic = useMemo(
    () => services.filter((s) => s.clinicId === clinicId),
    [services, clinicId],
  );
  const selectedService = servicesForClinic.find((s) => s.id === serviceId);

  // Re-reads the latest default* props every time the dialog transitions to
  // open -- required for the controlled/calendar path, where the parent
  // changes defaultDate/defaultTime/defaultStaffId and flips `open` in the
  // same render without ever calling handleOpenChange itself (a fully
  // controlled Radix Dialog only invokes onOpenChange for user-driven
  // closes, not for a parent-driven open). Done as a render-phase "adjusting
  // state" comparison (React's recommended pattern for this), not a
  // useEffect, which would cause an extra cascading render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPatient(defaultPatient ?? null);
      setClinicId(defaultClinicId ?? clinics[0]?.id ?? "");
      setServiceId("");
      setStaffId(defaultStaffId ?? "");
      setDate(defaultDate ?? todayLocal());
      setTime(defaultTime ?? nextHalfHourLocal());
      setNotes("");
      setError(null);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patient) {
      setError("Select a patient.");
      return;
    }
    // Constructed from the local date+time <input> values, which the
    // browser resolves in the viewer's own timezone -- see
    // lib/validation/appointment.schema.ts for why that stands in for the
    // clinic's timezone at MVP scale.
    const startAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startAt.getTime())) {
      setError("Enter a valid date and time.");
      return;
    }

    startTransition(async () => {
      const result = await createAppointmentAction({
        patientId: patient.id,
        serviceId,
        staffId,
        clinicId,
        startAt: startAt.toISOString(),
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Appointment booked.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Book appointment</DialogTitle>
            <DialogDescription>Schedule a new appointment.</DialogDescription>
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
              <Label htmlFor="appt-clinic">Clinic</Label>
              <Select
                value={clinicId}
                onValueChange={(v) => {
                  setClinicId(v);
                  setServiceId("");
                }}
              >
                <SelectTrigger id="appt-clinic" className="w-full">
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
              <Label htmlFor="appt-service">Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger id="appt-service" className="w-full">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {servicesForClinic.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedService && (
                <p className="text-muted-foreground text-sm">
                  <Money value={selectedService.price} /> · {selectedService.durationMinutes}{" "}
                  minutes
                </p>
              )}
              {servicesForClinic.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No active services at this clinic yet.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="appt-staff">Practitioner</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger id="appt-staff" className="w-full">
                  <SelectValue placeholder="Select a practitioner" />
                </SelectTrigger>
                <SelectContent>
                  {practitioners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="appt-date">Date</Label>
                <Input
                  id="appt-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="appt-time">Time</Label>
                <Input
                  id="appt-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="appt-notes">Notes</Label>
              <Textarea
                id="appt-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !serviceId || !staffId || !clinicId}>
              {pending ? "Booking…" : "Book appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
