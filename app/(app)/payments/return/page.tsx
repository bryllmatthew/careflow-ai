import Link from "next/link";
import { CheckCircle2, Clock, XCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/empty-state";
import { checkOnlinePaymentStatusAction } from "../actions";

/**
 * The customer landing here after a provider checkout is NOT proof of
 * payment (docs/PRODUCT_SPEC.md Phase 6 section 49) -- this page re-verifies
 * status server-side via checkOnlinePaymentStatusAction() before showing
 * anything, rather than assuming success from the redirect alone. The
 * webhook remains the authoritative path; this is only a friendlier status
 * check for whoever is still watching this tab.
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const invoiceParam = params.invoice;
  const invoiceId = Array.isArray(invoiceParam) ? invoiceParam[0] : invoiceParam;

  if (!invoiceId) {
    return (
      <div className="mx-auto max-w-md py-12">
        <EmptyState icon={HelpCircle} title="No payment reference" description="This link is missing an invoice reference." />
      </div>
    );
  }

  const { status } = await checkOnlinePaymentStatusAction(invoiceId);

  const content = {
    succeeded: {
      icon: CheckCircle2,
      title: "Payment received",
      description: "Thank you -- this payment has been confirmed.",
    },
    pending: {
      icon: Clock,
      title: "Payment pending",
      description: "We haven't received final confirmation yet. This can take a few minutes.",
    },
    failed: {
      icon: XCircle,
      title: "Payment did not succeed",
      description: "The payment was not completed. You can try again from the invoice.",
    },
    not_found: {
      icon: HelpCircle,
      title: "No payment found",
      description: "We couldn't find an online payment for this invoice.",
    },
  }[status];

  return (
    <div className="mx-auto max-w-md py-12">
      <EmptyState
        icon={content.icon}
        title={content.title}
        description={content.description}
        action={
          <Button asChild size="sm">
            <Link href={`/invoices/${invoiceId}`}>View invoice</Link>
          </Button>
        }
      />
    </div>
  );
}
