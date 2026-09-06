import { Ban, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { expirationStatus, expirationStatusLabels } from "@/lib/validation/inventory.schema";

const variants = {
  expired: "destructive",
  expiring_soon: "secondary",
  valid: "outline",
} as const;

const icons = {
  expired: Ban,
  expiring_soon: Clock,
  valid: CheckCircle2,
};

export function ExpirationBadge({ expirationDate }: { expirationDate: string | null }) {
  const status = expirationStatus(expirationDate);
  if (!status) return <span className="text-muted-foreground/50 text-sm">—</span>;
  const Icon = icons[status];
  return (
    <Badge variant={variants[status]}>
      <Icon className="size-3" aria-hidden />
      {expirationStatusLabels[status]}
    </Badge>
  );
}
