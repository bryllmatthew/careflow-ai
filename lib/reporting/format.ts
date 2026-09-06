/**
 * Centralized number/currency/percent formatting (section 47). The
 * organization's configured currency (`organizations.currency`, never a
 * hardcoded "PHP") is threaded through every call site in the reporting
 * layer -- see app/(app)/reports/queries.ts's `getReportingContext()`.
 */

export function formatCurrency(value: string | number, currency: string): string {
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

/** 1,284 / 12.9K / 4.2M -- for stat-tile hero figures (dataviz skill: "auto-compact"). */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export type PercentChange =
  | { kind: "change"; value: number; direction: "up" | "down" | "flat" }
  | { kind: "new" }
  | { kind: "no_data" };

/**
 * Section 8: "if the previous period is zero, do not display misleading
 * infinite percentages." The one place this rule is applied, so a dashboard
 * widget and a report table can never disagree on what "N/A" vs "New" means.
 */
export function safePercentChange(current: number, previous: number): PercentChange {
  if (previous === 0) {
    return current === 0 ? { kind: "no_data" } : { kind: "new" };
  }
  const value = ((current - previous) / Math.abs(previous)) * 100;
  const direction = value > 0.05 ? "up" : value < -0.05 ? "down" : "flat";
  return { kind: "change", value, direction };
}

export function formatPercentChange(change: PercentChange): string {
  if (change.kind === "no_data") return "N/A";
  if (change.kind === "new") return "New";
  const sign = change.value > 0 ? "+" : "";
  return `${sign}${change.value.toFixed(1)}%`;
}
