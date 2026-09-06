/**
 * Plain-Date-string helpers (YYYY-MM-DD), all operating in the viewer's
 * local timezone via the JS Date constructor -- consistent with how
 * appointment-form-dialog.tsx treats browser-local time as clinic-local
 * time at MVP scale (see lib/validation/appointment.schema.ts).
 */

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: string): string {
  const d = parseDateKey(key);
  const dow = d.getDay(); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toDateKey(d);
}

export function dayStartISO(key: string): string {
  return parseDateKey(key).toISOString();
}

export function dayEndISO(key: string): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export function weekRangeISO(mondayKey: string): { startISO: string; endISO: string } {
  return { startISO: dayStartISO(mondayKey), endISO: dayStartISO(addDays(mondayKey, 7)) };
}

export function formatDayHeading(key: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseDateKey(key));
}

export function formatWeekdayShort(key: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(
    parseDateKey(key),
  );
}
