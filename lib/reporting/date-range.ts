// Deliberately NOT `import "server-only"` -- this module is pure date math
// (Intl.DateTimeFormat, no DB access, no secret), and report-filter-bar.tsx
// (a client component) needs DATE_RANGE_KEYS/dateRangeLabels from it. Every
// actual query still runs server-side in app/(app)/reports/*-queries.ts,
// which import "server-only" themselves.
import {
  addZonedDays,
  addZonedMonths,
  getZonedYMD,
  startOfZonedDay,
  type ZonedYMD,
} from "./timezone";

/**
 * The full preset list from docs/PRODUCT_SPEC.md Phase 8 section 4, plus
 * "custom". Every dashboard/report filter in the app is one of these keys.
 */
export const DATE_RANGE_KEYS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "custom",
] as const;
export type DateRangeKey = (typeof DATE_RANGE_KEYS)[number];

export const dateRangeLabels: Record<DateRangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  last_quarter: "Last Quarter",
  this_year: "This Year",
  last_year: "Last Year",
  custom: "Custom Range",
};

export type ResolvedDateRange = {
  key: DateRangeKey;
  label: string;
  /** ISO instant, inclusive lower bound. */
  startUtc: string;
  /** ISO instant, EXCLUSIVE upper bound -- every query uses `.gte(startUtc).lt(endUtc)`. */
  endUtc: string;
  timezone: string;
  /** Whole calendar days spanned -- drives chart bucket granularity (section 10). */
  days: number;
};

/**
 * Weeks start Monday (ISO 8601 convention) -- not specified in the prompt,
 * documented here as the one place this decision lives.
 */
function startOfWeek(today: ZonedYMD & { weekday: number }, timeZone: string): ZonedYMD {
  const daysSinceMonday = (today.weekday + 6) % 7; // Sun(0)->6, Mon(1)->0, ...
  return addZonedDays(today, -daysSinceMonday, timeZone);
}

function startOfQuarter(today: ZonedYMD): ZonedYMD {
  const quarterStartMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
  return { year: today.year, month: quarterStartMonth, day: 1 };
}

function toRange(
  key: DateRangeKey,
  start: ZonedYMD,
  end: ZonedYMD,
  timeZone: string,
  label?: string,
): ResolvedDateRange {
  const startUtc = startOfZonedDay(start, timeZone);
  const endUtc = startOfZonedDay(end, timeZone);
  const days = Math.max(1, Math.round((endUtc.getTime() - startUtc.getTime()) / 86_400_000));
  return {
    key,
    label: label ?? dateRangeLabels[key],
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    timezone: timeZone,
    days,
  };
}

/** Parses a plain "YYYY-MM-DD" date-input value. Throws on malformed input -- callers validate with Zod first. */
function parseYmd(value: string): ZonedYMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * The single source of truth for every date-range boundary in the app
 * (section 5). `timeZone` is always the organization's `clinics`/
 * `organizations.timezone` -- never the server's local time, never a bare
 * `new Date()` day boundary.
 */
export function resolveDateRange(
  key: DateRangeKey,
  timeZone: string,
  custom?: { from: string; to: string },
): ResolvedDateRange {
  const now = getZonedYMD(new Date(), timeZone);

  switch (key) {
    case "today":
      return toRange(key, now, addZonedDays(now, 1, timeZone), timeZone);
    case "yesterday":
      return toRange(key, addZonedDays(now, -1, timeZone), now, timeZone);
    case "this_week": {
      const start = startOfWeek(now, timeZone);
      return toRange(key, start, addZonedDays(start, 7, timeZone), timeZone);
    }
    case "last_week": {
      const thisWeekStart = startOfWeek(now, timeZone);
      const start = addZonedDays(thisWeekStart, -7, timeZone);
      return toRange(key, start, thisWeekStart, timeZone);
    }
    case "this_month": {
      const start = { year: now.year, month: now.month, day: 1 };
      return toRange(key, start, addZonedMonths(start, 1), timeZone);
    }
    case "last_month": {
      const thisMonthStart = { year: now.year, month: now.month, day: 1 };
      const start = addZonedMonths(thisMonthStart, -1);
      return toRange(key, start, thisMonthStart, timeZone);
    }
    case "this_quarter": {
      const start = startOfQuarter(now);
      return toRange(key, start, addZonedMonths(start, 3), timeZone);
    }
    case "last_quarter": {
      const thisQStart = startOfQuarter(now);
      const start = addZonedMonths(thisQStart, -3);
      return toRange(key, start, thisQStart, timeZone);
    }
    case "this_year": {
      const start = { year: now.year, month: 1, day: 1 };
      return toRange(key, start, { year: now.year + 1, month: 1, day: 1 }, timeZone);
    }
    case "last_year": {
      const start = { year: now.year - 1, month: 1, day: 1 };
      return toRange(key, start, { year: now.year, month: 1, day: 1 }, timeZone);
    }
    case "custom": {
      if (!custom) throw new Error("custom range requires from/to");
      const from = parseYmd(custom.from);
      const toExclusive = addZonedDays(parseYmd(custom.to), 1, timeZone);
      const label = `${custom.from} – ${custom.to}`;
      return toRange(key, from, toExclusive, timeZone, label);
    }
  }
}

/**
 * "Compare against the immediately preceding period of equal duration"
 * (section 29) -- one generic rule for every range, named or custom. For a
 * named period this also happens to equal its literal predecessor (this
 * month's previous period IS last month) because the duration lines up
 * exactly; there is no special-cased branch per key.
 */
export function previousPeriod(range: ResolvedDateRange): ResolvedDateRange {
  const start = new Date(range.startUtc).getTime();
  const end = new Date(range.endUtc).getTime();
  const duration = end - start;
  return {
    key: range.key,
    label: `Previous ${range.label}`,
    startUtc: new Date(start - duration).toISOString(),
    endUtc: range.startUtc,
    timezone: range.timezone,
    days: range.days,
  };
}

export type TrendGranularity = "day" | "week" | "month";

/** Section 10: "7-day range -> daily, 90-day range -> weekly, 1-year range -> monthly." */
export function trendGranularity(range: ResolvedDateRange): TrendGranularity {
  if (range.days <= 31) return "day";
  if (range.days <= 180) return "week";
  return "month";
}

export type TrendBucket = { startUtc: string; endUtc: string; label: string };

/** The bucket boundaries a trend chart should aggregate into, for the given range and granularity. */
export function buildTrendBuckets(range: ResolvedDateRange): TrendBucket[] {
  const granularity = trendGranularity(range);
  const tz = range.timezone;
  const buckets: TrendBucket[] = [];
  let cursor: ZonedYMD = getZonedYMD(new Date(range.startUtc), tz);
  const endMs = new Date(range.endUtc).getTime();

  while (startOfZonedDay(cursor, tz).getTime() < endMs) {
    let next: ZonedYMD;
    let label: string;
    if (granularity === "day") {
      next = addZonedDays(cursor, 1, tz);
      label = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)));
    } else if (granularity === "week") {
      next = addZonedDays(cursor, 7, tz);
      label = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)));
    } else {
      next = addZonedMonths({ year: cursor.year, month: cursor.month, day: 1 }, 1);
      label = new Intl.DateTimeFormat(undefined, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)));
    }
    const startUtc = startOfZonedDay(cursor, tz);
    const endUtc = startOfZonedDay(next, tz);
    buckets.push({ startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(), label });
    cursor = next;
  }

  return buckets;
}
