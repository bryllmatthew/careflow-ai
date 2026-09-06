import { ClipboardCheck } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listPaymentsNeedingReview } from "../queries";
import { PaymentsTable } from "../payments-table";

/**
 * Payments stuck in `pending`/`processing` for longer than the staleness
 * window (30 minutes -- see listPaymentsNeedingReview). With no live payment
 * provider connected (lib/providers/payment/not-configured.ts), this view
 * can only ever detect staleness, not actually reconcile against a
 * provider's own records -- that requires a real PaymentProvider.verifyPayment()
 * implementation, honestly noted below rather than faked.
 */
export default async function ReconciliationPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("payments.reconcile", { organizationId });

  const stale = await listPaymentsNeedingReview(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reconciliation"
        description="Online payments stuck pending or processing for over 30 minutes."
      />

      <Alert>
        <AlertDescription>
          No online payment provider is connected in this environment, so payments can only be
          flagged as stale here -- they cannot be automatically re-verified against a provider.
          Connecting a real PaymentProvider implementation (lib/providers/payment) enables that.
        </AlertDescription>
      </Alert>

      {stale.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing needs review"
          description="No stale pending payments right now."
        />
      ) : (
        <Card className="gap-0 p-0">
          <PaymentsTable payments={stale} />
        </Card>
      )}
    </div>
  );
}
