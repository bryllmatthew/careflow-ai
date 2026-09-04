import { Badge } from "@/components/ui/badge";
import { invoiceStatusLabels, type InvoiceStatus } from "@/lib/validation/invoice.schema";

const variants: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  issued: "secondary",
  partially_paid: "secondary",
  paid: "default",
  overdue: "destructive",
  void: "destructive",
  cancelled: "destructive",
};

/** `isOverdue` overrides the stored status label for display -- see app/(app)/invoices/queries.ts. */
export function InvoiceStatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  if (isOverdue) return <Badge variant="destructive">Overdue</Badge>;
  const s = (status as InvoiceStatus) in invoiceStatusLabels ? (status as InvoiceStatus) : "draft";
  return <Badge variant={variants[s]}>{invoiceStatusLabels[s]}</Badge>;
}
