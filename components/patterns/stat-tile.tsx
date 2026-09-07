import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/** Which tinted chip the icon badge wears. Defaults to the brand accent. */
export type StatTileTone = "primary" | "success" | "warning" | "destructive" | "info";

const toneClasses: Record<StatTileTone, string> = {
  primary: "bg-tint-primary text-tint-primary-foreground",
  success: "bg-tint-success text-tint-success-foreground",
  warning: "bg-tint-warning text-tint-warning-foreground",
  destructive: "bg-tint-destructive text-tint-destructive-foreground",
  info: "bg-tint-info text-tint-info-foreground",
};

export function StatTile({
  label,
  value,
  icon: Icon,
  change,
  tone = "primary",
}: {
  label: string;
  /** A formatted display value, or null to render an honest "no data yet" placeholder. */
  value: string | null;
  icon: LucideIcon;
  /** Optional period-over-period delta -- pass a <ComparisonBadge /> (section 8). */
  change?: ReactNode;
  tone?: StatTileTone;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              toneClasses[tone],
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground truncate text-sm">{label}</p>
            {value === null ? (
              <p className="text-muted-foreground/50 text-2xl font-semibold">—</p>
            ) : (
              <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            )}
          </div>
        </div>
        {change && <div>{change}</div>}
      </CardContent>
    </Card>
  );
}
