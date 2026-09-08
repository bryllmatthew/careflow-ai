"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AvailabilityDay } from "@/lib/booking/public-queries";

/**
 * Date-then-time slot picker: a month calendar, then a dropdown of that day's
 * times.
 *
 * Shared by the booking flow and the reschedule page rather than written twice
 * -- a patient rescheduling should meet exactly the control they booked with,
 * and this phase's whole premise is one implementation behind many entry
 * points.
 *
 * All date arithmetic here is done on UTC-noon anchors and plain `YYYY-MM-DD`
 * strings, never on local `Date` construction. The calendar shows the CLINIC's
 * calendar, so "what day is it" must be answered in the clinic's timezone --
 * a patient booking from another country must not see the month shifted by
 * one. Same rule lib/reporting/timezone.ts follows for report boundaries.
 */

export type FetchDays = (
  fromDate: string,
  days: number,
) => Promise<{ ok: true; days: AvailabilityDay[] } | { ok: false; error: string }>;

// ---------------------------------------------------------------------------
// Calendar arithmetic (UTC-anchored, so no local-timezone drift)
// ---------------------------------------------------------------------------

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Weekday of the 1st, 0 = Monday (ISO 8601 — the convention this project uses everywhere). */
const firstWeekdayMondayBased = (y: number, m: number) =>
  (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;

const addDaysToISO = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. */
const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000,
  );

/** Today's calendar date in the clinic's timezone. `en-CA` yields YYYY-MM-DD. */
const todayInZone = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SlotPicker({
  timezone,
  maxAdvanceDays,
  scopeKey,
  fetchDays,
  onConfirm,
  confirmLabel = "Continue",
  confirming = false,
}: {
  timezone: string;
  maxAdvanceDays: number;
  /** Changes whenever the question changes (service/practitioner), forcing a refetch. */
  scopeKey: string;
  fetchDays: FetchDays;
  onConfirm: (startAtISO: string) => void;
  confirmLabel?: string;
  confirming?: boolean;
}) {
  const today = useMemo(() => todayInZone(timezone), [timezone]);
  const lastBookable = useMemo(() => addDaysToISO(today, maxAdvanceDays), [today, maxAdvanceDays]);

  const [view, setView] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [selectedDate, setSelectedDate] = useState<string>();
  const [selectedTime, setSelectedTime] = useState<string>();

  // The window actually worth asking the server about: this month, clipped to
  // [today, today + maxAdvanceDays]. Asking for days outside it would return
  // empty lists the calendar already knows to disable.
  const monthStart = iso(view.year, view.month, 1);
  const monthEnd = iso(view.year, view.month, daysInMonth(view.year, view.month));
  const from = monthStart < today ? today : monthStart;
  const to = monthEnd > lastBookable ? lastBookable : monthEnd;
  const span = to < from ? 0 : Math.min(daysBetween(from, to) + 1, 31);

  const requestKey = `${scopeKey}|${from}|${span}`;
  const [result, setResult] = useState<{ key: string; days: AvailabilityDay[]; error?: string }>();

  // Everything below is DERIVED from the one piece of fetched state. The
  // result carries the key of the question it answers, so "loading" is a
  // comparison rather than a second flag that can disagree with the data --
  // and a month outside the booking horizon (span === 0) needs no request and
  // no state at all, it is simply empty.
  const loaded = result?.key === requestKey ? result : undefined;
  const loading = span > 0 && !loaded;
  const error = loaded?.error;

  useEffect(() => {
    if (span === 0) return;
    let cancelled = false;
    fetchDays(from, span).then((res) => {
      if (cancelled) return;
      setResult(
        res.ok
          ? { key: requestKey, days: res.days }
          : { key: requestKey, days: [], error: res.error },
      );
    });
    return () => {
      cancelled = true;
    };
    // `requestKey` encodes from/span/scope; fetchDays is stable per render tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, span]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, AvailabilityDay["slots"]>();
    for (const d of loaded?.days ?? []) if (d.slots.length > 0) map.set(d.date, d.slots);
    return map;
  }, [loaded]);

  const fmtTime = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: timezone }),
    [timezone],
  );
  const fmtMonth = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }),
    [],
  );
  const fmtDayLong = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
    [],
  );

  // A selection from a previous month or scope must not survive into a view
  // that no longer offers it. Validated on read rather than cleared in an
  // effect: the stale value then never reaches a render at all, instead of
  // being rendered once and corrected on the next pass.
  const activeDate = selectedDate && slotsByDate.has(selectedDate) ? selectedDate : undefined;
  const selectedSlots = activeDate ? (slotsByDate.get(activeDate) ?? []) : [];
  const activeTime =
    selectedTime && selectedSlots.some((s) => s.startAt === selectedTime)
      ? selectedTime
      : undefined;

  const canGoPrev = iso(view.year, view.month, 1) > today.slice(0, 8) + "01";
  const nextMonthStart =
    view.month === 12 ? iso(view.year + 1, 1, 1) : iso(view.year, view.month + 1, 1);
  const canGoNext = nextMonthStart <= lastBookable;

  const shift = (delta: number) => {
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setView((v) => {
      const total = v.month - 1 + delta;
      return { year: v.year + Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
    });
  };

  const leading = firstWeekdayMondayBased(view.year, view.month);
  const total = daysInMonth(view.year, view.month);
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: total }, (_, i) => iso(view.year, view.month, i + 1)),
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
      {/* ------------------------------------------------------ calendar --- */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-medium" aria-live="polite">
            {fmtMonth.format(new Date(`${iso(view.year, view.month, 1)}T12:00:00Z`))}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous month"
              disabled={!canGoPrev || loading}
              onClick={() => shift(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next month"
              disabled={!canGoNext || loading}
              onClick={() => shift(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" aria-busy={loading}>
          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} />;

            const available = slotsByDate.has(date);
            const isSelected = date === activeDate;
            const isToday = date === today;

            return (
              <button
                key={date}
                type="button"
                disabled={!available || loading}
                aria-pressed={isSelected}
                aria-label={`${fmtDayLong.format(new Date(`${date}T12:00:00Z`))}${
                  available ? "" : " — no times available"
                }`}
                onClick={() => {
                  setSelectedDate(date);
                  setSelectedTime(undefined);
                }}
                className={cn(
                  "relative flex aspect-square items-center justify-center rounded-full text-sm transition-colors",
                  "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
                  isSelected && "bg-primary text-primary-foreground font-medium",
                  !isSelected &&
                    available &&
                    "bg-tint-primary text-tint-primary-foreground hover:bg-primary hover:text-primary-foreground font-medium",
                  !available && "text-muted-foreground/40",
                )}
              >
                {Number(date.slice(8, 10))}
                {/* A dot marks today, so the calendar is readable at a glance
                    without relying on colour alone for the selected state. */}
                {isToday && !isSelected && (
                  <span
                    className="bg-foreground/40 absolute bottom-1 size-1 rounded-full"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
          <Globe className="size-3.5 shrink-0" aria-hidden />
          Times shown in the clinic&apos;s timezone ({timezone})
        </p>
      </div>

      {/* ---------------------------------------------------------- time --- */}
      <div className="sm:border-l sm:pl-6">
        <div aria-live="polite">
          {loading && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading times…
            </p>
          )}

          {!loading && error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && slotsByDate.size === 0 && (
            <div className="text-muted-foreground space-y-3 text-sm">
              <p>No available times this month.</p>
              {canGoNext && (
                <Button variant="outline" size="sm" onClick={() => shift(1)}>
                  Try next month
                </Button>
              )}
            </div>
          )}

          {!loading && !error && slotsByDate.size > 0 && !activeDate && (
            <p className="text-muted-foreground text-sm">
              Pick a highlighted date to see available times.
            </p>
          )}

          {!loading && !error && activeDate && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {fmtDayLong.format(new Date(`${activeDate}T12:00:00Z`))}
              </p>

              <div className="grid gap-1.5">
                <label htmlFor="slot-time" className="text-muted-foreground text-xs">
                  Available times ({selectedSlots.length})
                </label>
                <Select value={activeTime} onValueChange={setSelectedTime}>
                  <SelectTrigger id="slot-time" className="w-full">
                    <SelectValue placeholder="Select a time" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSlots.map((slot) => (
                      <SelectItem key={slot.startAt} value={slot.startAt}>
                        {fmtTime.format(new Date(slot.startAt))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                disabled={!activeTime || confirming}
                onClick={() => activeTime && onConfirm(activeTime)}
              >
                {confirming && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {confirmLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
