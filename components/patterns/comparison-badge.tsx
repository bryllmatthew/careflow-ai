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
  const pill =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

  if (change.kind === "no_data") {
    return <span className={`${pill} bg-muted text-muted-foreground`}>N/A</span>;
  }
  if (change.kind === "new") {
    return <span className={`${pill} bg-tint-info text-tint-info-foreground`}>New</span>;
  }

  const isGood = invertGood ? change.direction === "down" : change.direction === "up";
  const toneClass =
    change.direction === "flat"
      ? "bg-muted text-muted-foreground"
      : isGood
        ? "bg-tint-success text-tint-success-foreground"
        : "bg-tint-destructive text-tint-destructive-foreground";
  const Icon =
    change.direction === "up" ? ArrowUp : change.direction === "down" ? ArrowDown : Minus;

  return (
    <span className={`${pill} ${toneClass}`}>
      <Icon className="size-3" aria-hidden />
      {formatPercentChange(change)}
    </span>
  );
}
