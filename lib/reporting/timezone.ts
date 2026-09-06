/**
 * Zero-dependency IANA timezone math (docs/PRODUCT_SPEC.md Phase 8 section 5:
 * "Use a centralized date/time utility... do not calculate date boundaries
 * independently inside every query"). No date library exists in this project
 * (CLAUDE.md never named one) -- rather than add date-fns-tz for two
 * primitives, this uses the well-known Intl.DateTimeFormat round-trip
 * technique, which is exact for every IANA zone including DST transitions.
 *
 * Every reporting date-range boundary in this app goes through these two
 * functions -- see date-range.ts. Never compute a boundary with
 * `new Date(y, m, d)` directly; that uses the SERVER's local timezone, not
 * the organization's, which is exactly the "Sept 5 00:00 shows Sept 4 data"
 * bug section 5 warns about.
 */

/** The offset (ms) to ADD to a UTC instant to get that instant's wall-clock time in `timeZone`. */
function getTimezoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // "24" from hourCycle h23 at exact midnight is normalized to "00" by the
  // formatter already; Date.UTC handles the rest.
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asIfUtc - instant.getTime();
}

/**
 * The UTC instant corresponding to a given wall-clock date/time IN `timeZone`.
 * `month` is 1-indexed (matches how every caller in this module reads).
 * Two-pass correction handles the rare case where the naive guess lands on
 * the wrong side of a DST transition.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = getTimezoneOffsetMs(new Date(guess), timeZone);
  const corrected = guess - offset1;
  const offset2 = getTimezoneOffsetMs(new Date(corrected), timeZone);
  return new Date(offset2 === offset1 ? corrected : guess - offset2);
}

export type ZonedYMD = { year: number; month: number; day: number };

/** What calendar date (and, incidentally, weekday) `instant` falls on in `timeZone`. */
export function getZonedYMD(instant: Date, timeZone: string): ZonedYMD & { weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    map.weekday ?? "Sun",
  );
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayIndex < 0 ? 0 : weekdayIndex,
  };
}

/** Start-of-day (00:00:00) for the given zoned calendar date, as a UTC instant. */
export function startOfZonedDay(ymd: ZonedYMD, timeZone: string): Date {
  return zonedTimeToUtc(ymd.year, ymd.month, ymd.day, 0, 0, 0, timeZone);
}

/** Adds `days` calendar days to a zoned Y/M/D (via a UTC-noon anchor, so it never drifts across a DST boundary). */
export function addZonedDays(ymd: ZonedYMD, days: number, timeZone: string): ZonedYMD {
  const anchorUtc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12, 0, 0) + days * 86_400_000;
  const { year, month, day } = getZonedYMD(new Date(anchorUtc), timeZone);
  return { year, month, day };
}

export function addZonedMonths(ymd: ZonedYMD, months: number): ZonedYMD {
  const total = ymd.month - 1 + months;
  const year = ymd.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return { year, month: month + 1, day: ymd.day };
}
