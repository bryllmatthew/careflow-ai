import { Badge } from "@/components/ui/badge";
import {
  purchaseOrderStatusLabels,
  type PurchaseOrderStatus,
} from "@/lib/validation/purchase-order.schema";

const variants: Record<PurchaseOrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  ordered: "secondary",
  partially_received: "secondary",
  received: "default",
  cancelled: "destructive",
};

export function PurchaseOrderStatusBadge({ status }: { status: string }) {
  const s =
    (status as PurchaseOrderStatus) in purchaseOrderStatusLabels
      ? (status as PurchaseOrderStatus)
      : "draft";
  return <Badge variant={variants[s]}>{purchaseOrderStatusLabels[s]}</Badge>;
}
