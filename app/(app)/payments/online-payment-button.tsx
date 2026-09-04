"use client";

import { useTransition } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { initiateOnlinePaymentAction } from "./actions";

/**
 * Always honestly reports "not configured" today (no PaymentProvider is
 * connected -- lib/providers/payment/not-configured.ts) rather than faking a
 * checkout. The button and the action behind it are fully real; only the
 * provider is absent. See CLAUDE.md's "No Mock Payments" rule.
 */
export function OnlinePaymentButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();

  function pay() {
    startTransition(async () => {
      const result = await initiateOnlinePaymentAction(invoiceId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.checkoutUrl;
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={pay}>
      <CreditCard className="size-4" />
      {pending ? "Starting…" : "Pay online"}
    </Button>
  );
}
