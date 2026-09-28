"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  Plus,
  Stethoscope,
  X,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOOTH_NUMBERING_LABELS, type ToothNumbering } from "@/lib/clinic-types";
import { displayToothNumber, type Tooth } from "@/lib/dental/teeth";
import {
  buildHistory,
  toothStates,
  type ConditionRecord,
  type TreatmentRecord,
} from "@/lib/dental/chart";
import {
  SURFACE_ABBREVIATIONS,
  TONE_CHIP,
  TONE_SVG,
  conditionMeta,
  treatmentStatusMeta,
} from "@/lib/dental/vocabulary";
import {
  closeTreatmentAction,
  completeTreatmentAction,
  setConditionStatusAction,
} from "@/app/(app)/patients/dental-actions";
import { Odontogram } from "./odontogram";
import { DentalHistoryList, ToothChip } from "./dental-history-list";
import {
  ConditionDialog,
  ReasonDialog,
  ScheduleDialog,
  TreatmentDialog,
  type AppointmentOption,
} from "./dental-dialogs";

type Dialog =
  | { kind: "condition" }
  | { kind: "treatment"; mode: "plan" | "record" }
  | { kind: "schedule"; treatment: TreatmentRecord }
  | { kind: "complete"; treatment: TreatmentRecord }
  | { kind: "cancel"; treatment: TreatmentRecord }
  | { kind: "treatment-error"; treatment: TreatmentRecord }
  | { kind: "resolve"; condition: ConditionRecord }
  | { kind: "condition-error"; condition: ConditionRecord }
  | null;

/**
 * The Dental Chart tab: the odontogram, a panel for whatever is selected, and
 * the patient's open treatment plan.
 *
 * Permissions arrive as booleans for rendering only. Every action is refused
 * server-side (dental-actions.ts) and again in the database (migration 0025)
 * if the caller lacks the permission, so a stale or tampered flag here can
 * only hide a button, never grant one.
 */
export function DentalChartPanel({
  patientId,
  teeth,
  numbering,
  conditions,
  treatments,
  appointments,
  services,
  practitioners,
  canRecord,
  canComplete,
  linkedAppointmentId,
}: {
  patientId: string;
  teeth: Tooth[];
  numbering: ToothNumbering;
  conditions: ConditionRecord[];
  treatments: TreatmentRecord[];
  appointments: AppointmentOption[];
  services: { id: string; name: string }[];
  practitioners: { id: string; name: string }[];
  canRecord: boolean;
  canComplete: boolean;
  /** Set when the chart was opened from an appointment: new treatments link to it. */
  linkedAppointmentId?: string;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);

  const teethByCode = useMemo(() => new Map(teeth.map((t) => [t.code, t])), [teeth]);
  const states = useMemo(() => toothStates(conditions, treatments), [conditions, treatments]);
  const open = treatments.filter((t) => t.status === "planned" || t.status === "scheduled");
  const linkedAppointment = appointments.find((a) => a.id === linkedAppointmentId);

  // Ascending by chart position reads naturally in chips and dialogs.
  const selectedCodes = [...selected].sort((a, b) => a - b);
  const single = selectedCodes.length === 1 ? teethByCode.get(selectedCodes[0]!) : undefined;

  function toggle(code: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const number = (code: number) => {
    const t = teethByCode.get(code);
    return t ? displayToothNumber(t, numbering) : String(code);
  };

  return (
    <div className="space-y-4">
      {linkedAppointment && (
        <div className="bg-tint-info text-tint-info-foreground flex items-start gap-2 rounded-xl px-4 py-3 text-sm">
          <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Charting for the appointment on{" "}
            <strong>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(linkedAppointment.startAt))}
            </strong>
            {linkedAppointment.serviceName ? ` (${linkedAppointment.serviceName})` : ""}. Treatments
            you plan or record here are linked to it.
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Dental chart</CardTitle>
              <CardDescription>
                Select one tooth to see its history, or several to plan one procedure across them.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="shrink-0 rounded-full">
              {TOOTH_NUMBERING_LABELS[numbering].split(" (")[0]}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <Odontogram
              teeth={teeth}
              numbering={numbering}
              states={states}
              selected={selected}
              onToggle={toggle}
            />
            <Legend />
          </CardContent>
        </Card>

        {/* ------------------------------------------------ selection panel -- */}
        <Card className="xl:self-start">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              {selectedCodes.length === 0
                ? "No tooth selected"
                : single
                  ? `Tooth ${number(single.code)}`
                  : `${selectedCodes.length} teeth selected`}
              {selectedCodes.length > 0 && (
                <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
                  <X className="size-3" aria-hidden />
                  Clear
                </Button>
              )}
            </CardTitle>
            {single && <CardDescription>{single.name}</CardDescription>}
          </CardHeader>

          <CardContent className="space-y-5">
            {selectedCodes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Click a tooth on the chart. Findings and planned work show on the teeth; a blue dot
                marks planned treatment.
              </p>
            ) : (
              <>
                {selectedCodes.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedCodes.map((c) => (
                      <ToothChip key={c} code={c} teethByCode={teethByCode} numbering={numbering} />
                    ))}
                  </div>
                )}

                {(canRecord || canComplete) && (
                  <div className="grid gap-2">
                    {canRecord && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialog({ kind: "condition" })}
                      >
                        <Plus className="size-4" aria-hidden />
                        Add condition
                      </Button>
                    )}
                    {canRecord && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialog({ kind: "treatment", mode: "plan" })}
                      >
                        <ClipboardPlus className="size-4" aria-hidden />
                        Plan treatment
                      </Button>
                    )}
                    {canRecord && canComplete && (
                      <Button
                        size="sm"
                        onClick={() => setDialog({ kind: "treatment", mode: "record" })}
                      >
                        <Stethoscope className="size-4" aria-hidden />
                        Record performed treatment
                      </Button>
                    )}
                  </div>
                )}

                <ToothFindings
                  codes={selectedCodes}
                  states={states}
                  number={number}
                  canRecord={canRecord}
                  onResolve={(condition) => setDialog({ kind: "resolve", condition })}
                  onRetract={(condition) => setDialog({ kind: "condition-error", condition })}
                />

                {single && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium">History</h3>
                    <DentalHistoryList
                      events={buildHistory(conditions, treatments, single.code)}
                      teeth={teeth}
                      numbering={numbering}
                      emptyText="Nothing recorded for this tooth yet."
                      compact
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------- treatment plan -- */}
      <Card>
        <CardHeader>
          <CardTitle>Treatment plan</CardTitle>
          <CardDescription>
            Planned and scheduled work. Performed and cancelled treatments are on the Dental History
            tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <p className="text-muted-foreground text-sm">No treatment planned.</p>
          ) : (
            <ul className="divide-y">
              {open.map((t) => {
                const status = treatmentStatusMeta(t.status);
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{t.procedure}</p>
                        <Badge
                          className={cn("rounded-full border-transparent", TONE_CHIP[status.tone])}
                        >
                          {status.label}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.teeth.map((x) => (
                          <ToothChip
                            key={x.toothCode}
                            code={x.toothCode}
                            surfaces={x.surfaces}
                            teethByCode={teethByCode}
                            numbering={numbering}
                          />
                        ))}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t.appointmentStartAt
                          ? `Scheduled ${new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(t.appointmentStartAt))}`
                          : "Not yet scheduled"}
                        {t.practitionerName ? ` · ${t.practitionerName}` : ""}
                      </p>
                    </div>

                    {(canRecord || canComplete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canRecord && (
                            <DropdownMenuItem
                              onSelect={() => setDialog({ kind: "schedule", treatment: t })}
                            >
                              <CalendarClock className="size-4" />
                              {t.appointmentId ? "Change appointment" : "Schedule"}
                            </DropdownMenuItem>
                          )}
                          {canComplete && (
                            <DropdownMenuItem
                              onSelect={() => setDialog({ kind: "complete", treatment: t })}
                            >
                              <CheckCircle2 className="size-4" />
                              Mark as performed
                            </DropdownMenuItem>
                          )}
                          {canRecord && (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDialog({ kind: "cancel", treatment: t })}
                            >
                              <X className="size-4" />
                              Cancel treatment
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- dialogs -- */}
      <ConditionDialog
        open={dialog?.kind === "condition"}
        onOpenChange={(o) => !o && setDialog(null)}
        patientId={patientId}
        toothCodes={selectedCodes}
        teethByCode={teethByCode}
        numbering={numbering}
      />
      <TreatmentDialog
        open={dialog?.kind === "treatment"}
        onOpenChange={(o) => !o && setDialog(null)}
        mode={dialog?.kind === "treatment" ? dialog.mode : "plan"}
        patientId={patientId}
        toothCodes={selectedCodes}
        teethByCode={teethByCode}
        numbering={numbering}
        services={services}
        appointments={appointments}
        practitioners={practitioners}
        defaultAppointmentId={linkedAppointmentId}
      />
      {dialog?.kind === "schedule" && (
        <ScheduleDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          treatmentId={dialog.treatment.id}
          currentAppointmentId={dialog.treatment.appointmentId}
          appointments={appointments}
        />
      )}
      {dialog?.kind === "complete" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Mark "${dialog.treatment.procedure}" as performed?`}
          description="This signs the treatment off under your name. It becomes permanent history and can afterwards only be corrected, not edited."
          confirmLabel="Mark as performed"
          reasonLabel="Clinical notes"
          reasonRequired={false}
          onSubmit={async (notes) => {
            const r = await completeTreatmentAction(dialog.treatment.id, notes);
            if (!r.error) toast.success("Treatment marked as performed");
            return r;
          }}
        />
      )}
      {dialog?.kind === "cancel" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Cancel "${dialog.treatment.procedure}"?`}
          description="It leaves the treatment plan but stays in the patient's history."
          confirmLabel="Cancel treatment"
          reasonRequired={false}
          destructive
          onSubmit={async (reason) => {
            const r = await closeTreatmentAction(dialog.treatment.id, {
              reason,
              enteredInError: false,
            });
            if (!r.error) toast.success("Treatment cancelled");
            return r;
          }}
        />
      )}
      {dialog?.kind === "resolve" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Resolve ${conditionMeta(dialog.condition.condition).label.toLowerCase()} on tooth ${number(dialog.condition.toothCode)}?`}
          description="The finding stops showing on the chart. It stays in the tooth's history."
          confirmLabel="Resolve"
          reasonLabel="Note"
          reasonRequired={false}
          onSubmit={async (reason) => {
            const r = await setConditionStatusAction(dialog.condition.id, {
              status: "resolved",
              reason,
            });
            if (!r.error) toast.success("Finding resolved");
            return r;
          }}
        />
      )}
      {dialog?.kind === "condition-error" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="Mark as entered in error?"
          description="Use this when the finding was never true -- charted on the wrong tooth or patient. It stays visible in the history, struck through, with your reason."
          confirmLabel="Mark entered in error"
          reasonRequired
          destructive
          onSubmit={async (reason) => {
            const r = await setConditionStatusAction(dialog.condition.id, {
              status: "entered_in_error",
              reason,
            });
            if (!r.error) toast.success("Marked as entered in error");
            return r;
          }}
        />
      )}
    </div>
  );
}

function ToothFindings({
  codes,
  states,
  number,
  canRecord,
  onResolve,
  onRetract,
}: {
  codes: number[];
  states: ReturnType<typeof toothStates>;
  number: (code: number) => string;
  canRecord: boolean;
  onResolve: (c: ConditionRecord) => void;
  onRetract: (c: ConditionRecord) => void;
}) {
  const rows = codes.map((code) => ({ code, state: states.get(code) }));
  const multiple = codes.length > 1;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Current findings</h3>
      {rows.map(({ code, state }) => (
        <div key={code} className="space-y-1.5">
          {multiple && (
            <p className="text-muted-foreground text-xs font-medium">Tooth {number(code)}</p>
          )}
          {!state || (state.present.length === 0 && state.open.length === 0) ? (
            <p className="text-muted-foreground text-sm">Healthy — no findings recorded.</p>
          ) : (
            <>
              {state.present.map((c) => {
                const meta = conditionMeta(c.condition);
                return (
                  <div key={c.id} className="flex items-center gap-2">
                    <Badge className={cn("rounded-full border-transparent", TONE_CHIP[meta.tone])}>
                      {meta.label}
                    </Badge>
                    {c.surfaces.length > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {c.surfaces.map((s) => SURFACE_ABBREVIATIONS[s]).join("")}
                      </span>
                    )}
                    {canRecord && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="ml-auto"
                            aria-label={`Actions for ${meta.label}`}
                          >
                            Update
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onResolve(c)}>Resolve</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => onRetract(c)}>
                            Entered in error
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
              {state.open.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="bg-primary size-2 shrink-0 rounded-full" aria-hidden />
                  <span>
                    {t.procedure}{" "}
                    <span className="text-muted-foreground">
                      ({treatmentStatusMeta(t.status).label.toLowerCase()})
                    </span>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Swatches use the chart's own fills (TONE_SVG), so the legend always matches the teeth. */
const LEGEND: { label: string; tone: keyof typeof TONE_SVG }[] = [
  { label: "Caries / for extraction", tone: "destructive" },
  { label: "Restoration / root canal", tone: "info" },
  { label: "Crown / bridge / implant", tone: "primary" },
  { label: "Impacted / observation", tone: "warning" },
  { label: "Missing / extracted", tone: "muted" },
];

function Legend() {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {LEGEND.map((l) => (
        <li key={l.label} className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-sm border"
            style={{ background: TONE_SVG[l.tone].fill, borderColor: TONE_SVG[l.tone].stroke }}
            aria-hidden
          />
          {l.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="bg-primary size-2 rounded-full" aria-hidden />
        Planned treatment
      </li>
    </ul>
  );
}
