import { conditionMeta, type DentalSurface } from "./vocabulary";

/**
 * The shape of a patient's dental record once loaded, and the two derivations
 * every dental screen needs: the current state of each tooth, and the
 * history. Both are computed from the same rows in one place, so the chart,
 * the per-tooth timeline and the patient-level history can never tell three
 * different stories.
 *
 * Client-safe: plain data in, plain data out.
 */

export type ConditionRecord = {
  id: string;
  toothCode: number;
  surfaces: DentalSurface[];
  condition: string;
  status: "present" | "resolved" | "entered_in_error";
  notes: string | null;
  statusReason: string | null;
  sourceTreatmentId: string | null;
  notedAt: string;
  notedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
};

export type TreatmentRecord = {
  id: string;
  procedure: string;
  status: "planned" | "scheduled" | "completed" | "cancelled" | "entered_in_error";
  resultingCondition: string | null;
  notes: string | null;
  statusReason: string | null;
  teeth: { toothCode: number; surfaces: DentalSurface[] }[];
  appointmentId: string | null;
  appointmentStartAt: string | null;
  serviceName: string | null;
  practitionerName: string | null;
  plannedAt: string;
  plannedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
};

export type ToothState = {
  /** Findings currently true of the tooth, most significant first. */
  present: ConditionRecord[];
  /** Planned or scheduled work, not yet performed. */
  open: TreatmentRecord[];
};

/** Present findings and open work, per tooth. A tooth absent from the map is healthy with nothing planned. */
export function toothStates(
  conditions: ConditionRecord[],
  treatments: TreatmentRecord[],
): Map<number, ToothState> {
  const map = new Map<number, ToothState>();
  const get = (code: number) => {
    let s = map.get(code);
    if (!s) {
      s = { present: [], open: [] };
      map.set(code, s);
    }
    return s;
  };

  for (const c of conditions) {
    if (c.status === "present") get(c.toothCode).present.push(c);
  }
  for (const t of treatments) {
    if (t.status === "planned" || t.status === "scheduled") {
      for (const tooth of t.teeth) get(tooth.toothCode).open.push(t);
    }
  }
  for (const s of map.values()) {
    s.present.sort(
      (a, b) => conditionMeta(b.condition).priority - conditionMeta(a.condition).priority,
    );
  }
  return map;
}

export type HistoryEvent = {
  /** Stable key for rendering. */
  key: string;
  at: string;
  kind:
    | "condition_noted"
    | "condition_resolved"
    | "condition_corrected"
    | "treatment_planned"
    | "treatment_completed"
    | "treatment_cancelled"
    | "treatment_corrected";
  title: string;
  teeth: { toothCode: number; surfaces: DentalSurface[] }[];
  by: string | null;
  detail: string | null;
  /** The event's record was later marked entered-in-error. */
  retracted: boolean;
  treatmentId: string | null;
  conditionId: string | null;
};

/**
 * Every recorded event, newest first. Pass `toothCode` for one tooth's
 * timeline.
 *
 * Retracted records stay in the history, flagged rather than removed: a
 * clinical record shows what was believed and when, including the mistakes.
 * That is the point of never deleting.
 */
export function buildHistory(
  conditions: ConditionRecord[],
  treatments: TreatmentRecord[],
  toothCode?: number,
): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const onTooth = (codes: number[]) => toothCode === undefined || codes.includes(toothCode);

  for (const c of conditions) {
    if (!onTooth([c.toothCode])) continue;
    // A finding written by completing a treatment is shown as part of that
    // treatment's completion, not as a second, separate event.
    if (c.sourceTreatmentId && c.status !== "entered_in_error") {
      if (c.status === "resolved" && c.closedAt) {
        events.push(conditionEvent(c, "condition_resolved"));
      }
      continue;
    }
    const label = conditionMeta(c.condition).label;
    events.push({
      key: `c-${c.id}-noted`,
      at: c.notedAt,
      kind: "condition_noted",
      title: label,
      teeth: [{ toothCode: c.toothCode, surfaces: c.surfaces }],
      by: c.notedBy,
      detail: c.notes,
      retracted: c.status === "entered_in_error",
      treatmentId: null,
      conditionId: c.id,
    });
    if (c.status === "resolved" && c.closedAt) events.push(conditionEvent(c, "condition_resolved"));
    if (c.status === "entered_in_error" && c.closedAt)
      events.push(conditionEvent(c, "condition_corrected"));
  }

  for (const t of treatments) {
    if (!onTooth(t.teeth.map((x) => x.toothCode))) continue;
    const teeth =
      toothCode === undefined ? t.teeth : t.teeth.filter((x) => x.toothCode === toothCode);
    const retracted = t.status === "entered_in_error";
    const base = { teeth, treatmentId: t.id, conditionId: null, retracted };

    events.push({
      ...base,
      key: `t-${t.id}-planned`,
      at: t.plannedAt,
      kind: "treatment_planned",
      title: `${t.procedure} planned`,
      by: t.plannedBy,
      detail: t.notes,
    });
    if (t.completedAt) {
      events.push({
        ...base,
        key: `t-${t.id}-completed`,
        at: t.completedAt,
        kind: "treatment_completed",
        title: t.procedure,
        by: t.practitionerName ?? t.completedBy,
        detail: t.resultingCondition
          ? `Charted as ${conditionMeta(t.resultingCondition).label.toLowerCase()}`
          : null,
      });
    }
    if (t.closedAt && (t.status === "cancelled" || t.status === "entered_in_error")) {
      events.push({
        ...base,
        key: `t-${t.id}-closed`,
        at: t.closedAt,
        kind: t.status === "cancelled" ? "treatment_cancelled" : "treatment_corrected",
        title:
          t.status === "cancelled"
            ? `${t.procedure} cancelled`
            : `${t.procedure} marked entered in error`,
        by: t.closedBy,
        detail: t.statusReason,
        retracted: false,
      });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

function conditionEvent(
  c: ConditionRecord,
  kind: "condition_resolved" | "condition_corrected",
): HistoryEvent {
  const label = conditionMeta(c.condition).label;
  return {
    key: `c-${c.id}-${kind}`,
    at: c.closedAt ?? c.notedAt,
    kind,
    title: kind === "condition_resolved" ? `${label} resolved` : `${label} marked entered in error`,
    teeth: [{ toothCode: c.toothCode, surfaces: c.surfaces }],
    by: c.closedBy,
    detail: c.statusReason,
    retracted: false,
    treatmentId: null,
    conditionId: c.id,
  };
}
