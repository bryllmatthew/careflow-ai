import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  /** A formatted display value, or null to render an honest "no data yet" placeholder. */
  value: string | null;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <p className="text-muted-foreground text-sm">{label}</p>
        <Icon className="text-muted-foreground size-4" aria-hidden />
      </CardHeader>
      <CardContent>
        {value === null ? (
          <p className="text-muted-foreground/50 text-2xl font-semibold">—</p>
        ) : (
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
