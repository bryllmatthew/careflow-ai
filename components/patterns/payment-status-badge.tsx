import { Badge } from "@/components/ui/badge";
import { paymentStatusLabels, type PaymentStatus } from "@/lib/validation/payment.schema";

const variants: Record<PaymentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  processing: "secondary",
  succeeded: "default",
  failed: "destructive",
  cancelled: "destructive",
  partially_refunded: "secondary",
  refunded: "outline",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const s = (status as PaymentStatus) in paymentStatusLabels ? (status as PaymentStatus) : "pending";
  return <Badge variant={variants[s]}>{paymentStatusLabels[s]}</Badge>;
}
