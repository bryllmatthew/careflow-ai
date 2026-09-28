import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ToothNumbering } from "@/lib/clinic-types";
import { displayToothNumber, type Tooth } from "@/lib/dental/teeth";
import type { HistoryEvent } from "@/lib/dental/chart";
import { SURFACE_ABBREVIATIONS, TONE_CHIP, type DentalTone } from "@/lib/dental/vocabulary";

/**
 * A dental history timeline, grouped by day. Renders the events
 * lib/dental/chart.ts builds -- for one tooth in the chart panel, or for the
 * whole mouth on the Dental History tab -- so both read identically.
 *
 * No hooks, so it renders on the server (history tab) and inside the client
 * chart panel alike.
 */

const KIND_TONE: Record<HistoryEvent["kind"], DentalTone> = {
  condition_noted: "warning",
  condition_resolved: "success",
  condition_corrected: "muted",
  treatment_planned: "info",
  treatment_completed: "success",
  treatment_cancelled: "muted",
  treatment_corrected: "muted",
};

const KIND_LABEL: Record<HistoryEvent["kind"], string> = {
  condition_noted: "Finding",
  condition_resolved: "Resolved",
  condition_corrected: "Correction",
  treatment_planned: "Planned",
  treatment_completed: "Performed",
  treatment_cancelled: "Cancelled",
  treatment_corrected: "Correction",
};

export function ToothChip({
  code,
  surfaces,
  teethByCode,
  numbering,
}: {
  code: number;
  surfaces?: readonly string[];
  teethByCode: Map<number, Tooth>;
  numbering: ToothNumbering;
}) {
  const tooth = teethByCode.get(code);
  const number = tooth ? displayToothNumber(tooth, numbering) : String(code);
  const surf = (surfaces ?? [])
    .map((s) => SURFACE_ABBREVIATIONS[s as keyof typeof SURFACE_ABBREVIATIONS] ?? s)
    .join("");
  return (
    <span
      title={tooth?.name}
      className="bg-muted text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
    >
      {number}
      {surf && <span className="text-muted-foreground font-normal">{surf}</span>}
    </span>
  );
}

export function DentalHistoryList({
  events,
  teeth,
  numbering,
  emptyText = "No dental history recorded yet.",
  compact = false,
}: {
  events: HistoryEvent[];
  teeth: Tooth[];
  numbering: ToothNumbering;
  emptyText?: string;
  compact?: boolean;
}) {
  if (events.length === 0) {
    return <p className="text-muted-foreground py-4 text-sm">{emptyText}</p>;
  }

  const teethByCode = new Map(teeth.map((t) => [t.code, t]));
  const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

  const days: { day: string; items: HistoryEvent[] }[] = [];
  for (const e of events) {
    const day = dayFormat.format(new Date(e.at));
    const last = days.at(-1);
    if (last && last.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }

  return (
    <ol className={cn("space-y-5", compact && "space-y-4")}>
      {days.map(({ day, items }) => (
        <li key={day}>
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
            {day}
          </p>
          <ol className="border-border space-y-3 border-l pl-4">
            {items.map((e) => (
              <li key={e.key} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "border-card absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2",
                    TONE_CHIP[KIND_TONE[e.kind]],
                  )}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge
                    className={cn(
                      "rounded-full border-transparent px-2 py-0 text-[0.6875rem]",
                      TONE_CHIP[KIND_TONE[e.kind]],
                    )}
                  >
                    {KIND_LABEL[e.kind]}
                  </Badge>
                  <span
                    className={cn("text-sm font-medium", e.retracted && "line-through opacity-60")}
                  >
                    {e.title}
                  </span>
                  {e.retracted && (
                    <Badge variant="secondary" className="rounded-full px-2 py-0 text-[0.6875rem]">
                      Entered in error
                    </Badge>
                  )}
                </div>
                {e.teeth.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {e.teeth.map((t) => (
                      <ToothChip
                        key={t.toothCode}
                        code={t.toothCode}
                        surfaces={t.surfaces}
                        teethByCode={teethByCode}
                        numbering={numbering}
                      />
                    ))}
                  </div>
                )}
                {e.detail && <p className="text-muted-foreground mt-1 text-sm">{e.detail}</p>}
                <p className="text-muted-foreground mt-1 text-xs">
                  {timeFormat.format(new Date(e.at))}
                  {e.by ? ` · ${e.by}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
