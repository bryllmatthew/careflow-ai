import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { formatPercentChange, type PercentChange } from "@/lib/reporting/format";

/**
 * Section 8's "safe percentage change" rule, rendered consistently
 * everywhere a KPI shows a period-over-period delta. Never color-only
 * (icon + text always accompany it) -- section 55.
 */
export function ComparisonBadge({
  change,
  invertGood = false,
}: {
  change: PercentChange;
  /** True for metrics where a decrease is the good direction (no-show rate, cancellation rate). */
  invertGood?: boolean;
}) {
  if (change.kind === "no_data") {
    return <span className="text-muted-foreground text-xs">N/A</span>;
  }
  if (change.kind === "new") {
    return <span className="text-info text-xs font-medium">New</span>;
  }

  const isGood = invertGood ? change.direction === "down" : change.direction === "up";
  const colorClass =
    change.direction === "flat"
      ? "text-muted-foreground"
      : isGood
        ? "text-success"
        : "text-destructive";
  const Icon =
    change.direction === "up" ? ArrowUp : change.direction === "down" ? ArrowDown : Minus;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass}`}>
      <Icon className="size-3" aria-hidden />
      {formatPercentChange(change)}
    </span>
  );
}
