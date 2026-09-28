"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ToothNumbering } from "@/lib/clinic-types";
import { surfacesFor, type Tooth } from "@/lib/dental/teeth";
import {
  DENTAL_CONDITIONS,
  DENTAL_SURFACES,
  SURFACE_LABELS,
  conditionMeta,
  type DentalCondition,
  type DentalSurface,
} from "@/lib/dental/vocabulary";
import {
  recordConditionsAction,
  planTreatmentAction,
  scheduleTreatmentAction,
} from "@/app/(app)/patients/dental-actions";
import { ToothChip } from "./dental-history-list";

export type AppointmentOption = {
  id: string;
  startAt: string;
  serviceName: string | null;
  staffName: string | null;
  status: string;
};

const NONE = "__none__";

const appointmentLabel = (a: AppointmentOption) =>
  `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(a.startAt),
  )}${a.serviceName ? ` · ${a.serviceName}` : ""}`;

/**
 * The surfaces worth offering for a selection: the union of what each
 * selected tooth has (an incisor contributes "incisal", a molar "occlusal").
 */
function surfacesForSelection(codes: number[], teethByCode: Map<number, Tooth>): DentalSurface[] {
  const set = new Set<DentalSurface>();
  for (const code of codes) {
    const tooth = teethByCode.get(code);
    if (tooth) for (const s of surfacesFor(tooth)) set.add(s);
  }
  return DENTAL_SURFACES.filter((s) => set.has(s));
}

function SurfacePicker({
  offered,
  value,
  onChange,
  disabled,
}: {
  offered: DentalSurface[];
  value: DentalSurface[];
  onChange: (next: DentalSurface[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Surfaces">
      {offered.map((s) => {
        const on = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
              on
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-card hover:bg-muted text-foreground",
            )}
          >
            {SURFACE_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

function SelectedTeeth({
  codes,
  teethByCode,
  numbering,
}: {
  codes: number[];
  teethByCode: Map<number, Tooth>;
  numbering: ToothNumbering;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <ToothChip key={c} code={c} teethByCode={teethByCode} numbering={numbering} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ConditionDialog({
  open,
  onOpenChange,
  patientId,
  toothCodes,
  teethByCode,
  numbering,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  toothCodes: number[];
  teethByCode: Map<number, Tooth>;
  numbering: ToothNumbering;
}) {
  const [condition, setCondition] = useState<DentalCondition | "">("");
  const [surfaces, setSurfaces] = useState<DentalSurface[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const offered = surfacesForSelection(toothCodes, teethByCode);
  const surfaceLevel = condition !== "" && conditionMeta(condition).render === "surface";

  function reset() {
    setCondition("");
    setSurfaces([]);
    setNotes("");
    setError(undefined);
  }

  function submit() {
    if (!condition) {
      setError("Choose a condition.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await recordConditionsAction(patientId, {
        toothCodes,
        condition,
        surfaces: surfaceLevel ? surfaces : [],
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      const count = toothCodes.length === 1 ? "1 tooth" : `${toothCodes.length} teeth`;
      toast.success(`${conditionMeta(condition).label} recorded on ${count}`);
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add condition</DialogTitle>
          <DialogDescription>
            An observation about the tooth. It stays in the patient&apos;s history even after
            it&apos;s treated or resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SelectedTeeth codes={toothCodes} teethByCode={teethByCode} numbering={numbering} />

          <div className="grid gap-1.5">
            <Label htmlFor="dental-condition">Condition</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as DentalCondition)}>
              <SelectTrigger id="dental-condition" className="w-full">
                <SelectValue placeholder="Choose a condition" />
              </SelectTrigger>
              <SelectContent>
                {DENTAL_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {conditionMeta(c).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Surfaces only mean something for surface-level findings; a
              missing tooth or a crown is the whole tooth. */}
          {surfaceLevel && (
            <div className="grid gap-1.5">
              <Label>
                Surfaces <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <SurfacePicker
                offered={offered}
                value={surfaces}
                onChange={setSurfaces}
                disabled={pending}
              />
              {toothCodes.length > 1 && (
                <p className="text-muted-foreground text-xs">Applied to every selected tooth.</p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="dental-condition-notes">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="dental-condition-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Record condition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function TreatmentDialog({
  open,
  onOpenChange,
  mode,
  patientId,
  toothCodes,
  teethByCode,
  numbering,
  services,
  appointments,
  practitioners,
  defaultAppointmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** plan: add to the treatment plan. record: a procedure performed now (signed off). */
  mode: "plan" | "record";
  patientId: string;
  toothCodes: number[];
  teethByCode: Map<number, Tooth>;
  numbering: ToothNumbering;
  services: { id: string; name: string }[];
  appointments: AppointmentOption[];
  practitioners: { id: string; name: string }[];
  defaultAppointmentId?: string;
}) {
  const [procedure, setProcedure] = useState("");
  const [serviceId, setServiceId] = useState(NONE);
  const [appointmentId, setAppointmentId] = useState(defaultAppointmentId ?? NONE);
  const [practitionerId, setPractitionerId] = useState(NONE);
  const [resulting, setResulting] = useState<string>(NONE);
  const [surfaces, setSurfaces] = useState<DentalSurface[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const offered = surfacesForSelection(toothCodes, teethByCode);
  const record = mode === "record";

  function reset() {
    setProcedure("");
    setServiceId(NONE);
    setAppointmentId(defaultAppointmentId ?? NONE);
    setPractitionerId(NONE);
    setResulting(NONE);
    setSurfaces([]);
    setNotes("");
    setError(undefined);
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await planTreatmentAction(patientId, {
        procedure,
        teeth: toothCodes.map((toothCode) => ({ toothCode, surfaces })),
        serviceId: serviceId === NONE ? undefined : serviceId,
        appointmentId: appointmentId === NONE ? undefined : appointmentId,
        practitionerId: practitionerId === NONE ? undefined : practitionerId,
        resultingCondition: resulting === NONE ? undefined : (resulting as DentalCondition),
        notes,
        completeNow: record,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(record ? "Treatment recorded" : "Added to the treatment plan");
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{record ? "Record treatment" : "Plan treatment"}</DialogTitle>
          <DialogDescription>
            {record
              ? "A procedure performed now. It's signed off under your name and becomes permanent history."
              : "Adds the procedure to the treatment plan. It's only marked performed when someone signs it off."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SelectedTeeth codes={toothCodes} teethByCode={teethByCode} numbering={numbering} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="dental-service">Service</Label>
              <Select
                value={serviceId}
                onValueChange={(v) => {
                  setServiceId(v);
                  // A chosen service names the procedure unless one was typed.
                  const svc = services.find((s) => s.id === v);
                  if (svc && !procedure.trim()) setProcedure(svc.name);
                }}
              >
                <SelectTrigger id="dental-service" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No linked service</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dental-procedure">Procedure</Label>
              <Input
                id="dental-procedure"
                value={procedure}
                maxLength={200}
                placeholder="Composite restoration"
                onChange={(e) => setProcedure(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>
              Surfaces <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <SurfacePicker
              offered={offered}
              value={surfaces}
              onChange={setSurfaces}
              disabled={pending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="dental-appointment">Appointment</Label>
              <Select value={appointmentId} onValueChange={setAppointmentId}>
                <SelectTrigger id="dental-appointment" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {appointments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {appointmentLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dental-practitioner">Practitioner</Label>
              <Select value={practitionerId} onValueChange={setPractitionerId}>
                <SelectTrigger id="dental-practitioner" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    {appointmentId !== NONE ? "The appointment's practitioner" : "Me"}
                  </SelectItem>
                  {practitioners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="dental-resulting">When performed, chart the tooth as</Label>
            <Select value={resulting} onValueChange={setResulting}>
              <SelectTrigger id="dental-resulting" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No change to the chart</SelectItem>
                {DENTAL_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {conditionMeta(c).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              E.g. an extraction charts the tooth as extracted. Existing findings are never cleared
              automatically — resolve them yourself when that&apos;s clinically right.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="dental-treatment-notes">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="dental-treatment-notes"
              rows={2}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {record ? "Record as performed" : "Add to plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function ScheduleDialog({
  open,
  onOpenChange,
  treatmentId,
  currentAppointmentId,
  appointments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatmentId: string;
  currentAppointmentId: string | null;
  appointments: AppointmentOption[];
}) {
  const [appointmentId, setAppointmentId] = useState(currentAppointmentId ?? NONE);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  // Read once when the dialog opens, not on every render: a clock read during
  // render makes the output depend on when React happens to re-render.
  const [openedAt] = useState(() => Date.now());

  // Only appointments still to come can have work scheduled into them.
  const upcoming = appointments.filter(
    (a) =>
      a.id === currentAppointmentId ||
      (new Date(a.startAt).getTime() > openedAt &&
        !["cancelled", "no_show", "completed"].includes(a.status)),
  );

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await scheduleTreatmentAction(
        treatmentId,
        appointmentId === NONE ? null : appointmentId,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(
        appointmentId === NONE ? "Unlinked from the appointment" : "Treatment scheduled",
      );
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule treatment</DialogTitle>
          <DialogDescription>
            Link this treatment to an appointment. It stays planned until someone signs it off.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="dental-schedule-appointment">Appointment</Label>
          <Select value={appointmentId} onValueChange={setAppointmentId}>
            <SelectTrigger id="dental-schedule-appointment" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not linked</SelectItem>
              {upcoming.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {appointmentLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {upcoming.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No upcoming appointments. Book one from the patient&apos;s profile first.
            </p>
          )}
        </div>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/** A reason prompt for cancelling, resolving or correcting a record. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  reasonLabel = "Reason",
  reasonRequired,
  destructive,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel?: string;
  reasonRequired: boolean;
  destructive?: boolean;
  onSubmit: (reason: string) => Promise<{ error?: string }>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit() {
    if (reasonRequired && !reason.trim()) {
      setError("Please give a reason.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await onSubmit(reason.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      setReason("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setError(undefined);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="dental-reason">
            {reasonLabel}
            {!reasonRequired && (
              <span className="text-muted-foreground font-normal"> (optional)</span>
            )}
          </Label>
          <Textarea
            id="dental-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Back
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={submit}
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
