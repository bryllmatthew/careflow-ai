import { AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { stockStatusLabels, type StockStatus } from "@/lib/validation/inventory.schema";

const variants: Record<StockStatus, "default" | "secondary" | "destructive"> = {
  in_stock: "default",
  low_stock: "secondary",
  out_of_stock: "destructive",
};

const icons: Record<StockStatus, typeof CheckCircle2> = {
  in_stock: CheckCircle2,
  low_stock: AlertTriangle,
  out_of_stock: XCircle,
};

/** Never color-only (section 43) -- icon + text every time. */
export function StockStatusBadge({ status }: { status: string }) {
  const s = (status as StockStatus) in stockStatusLabels ? (status as StockStatus) : "in_stock";
  const Icon = icons[s];
  return (
    <Badge variant={variants[s]}>
      <Icon className="size-3" aria-hidden />
      {stockStatusLabels[s]}
    </Badge>
  );
}
