import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getPaymentById } from "@/app/(app)/payments/queries";
import { Money } from "@/components/patterns/money";
import { paymentMethodLabels, type PaymentMethod } from "@/lib/validation/payment.schema";
import { PrintButton } from "@/app/invoices/[id]/print/print-button";

const RECEIPTABLE_STATUSES = new Set(["succeeded", "partially_refunded", "refunded"]);

/**
 * A receipt corresponds to an actual successful payment -- never generated
 * for a pending or failed one (CLAUDE.md's "No Mock Payments" rule extends
 * here: a receipt is proof money was received, so it must never be
 * fabricated ahead of that being true). Outside the (app) route group, same
 * reasoning as the invoice print page: no app-shell chrome, still
 * auth-gated, and getPaymentById() is the real RLS access check.
 */
export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const payment = await getPaymentById(id);
  if (!payment) notFound();

  if (!RECEIPTABLE_STATUSES.has(payment.status)) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-muted-foreground text-sm">
          A receipt isn&apos;t available for this payment -- it hasn&apos;t succeeded.
        </p>
      </div>
    );
  }

  const supabase = await getSupabaseServerClient();
  const [{ data: clinic }, { data: org }] = await Promise.all([
    supabase
      .from("clinics")
      .select("name, address, phone, email")
      .eq("id", payment.clinicId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", auth.memberships[0]!.organizationId)
      .maybeSingle(),
  ]);

  const netReceived = (Number(payment.amount) - Number(payment.refundedAmount)).toFixed(2);

  return (
    <div className="mx-auto max-w-xl p-8 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="flex items-start justify-between border-b pb-6">
        <div>
          <h1 className="text-xl font-semibold">{org?.name ?? "CareFlow AI"}</h1>
          <p className="text-muted-foreground text-sm">{clinic?.name}</p>
          {clinic?.address && <p className="text-muted-foreground text-sm">{clinic.address}</p>}
          <p className="text-muted-foreground text-sm">
            {[clinic?.phone, clinic?.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">Receipt</h2>
          <p className="text-muted-foreground text-sm">#{payment.id.slice(-8).toUpperCase()}</p>
          <p className="text-muted-foreground text-sm">
            {payment.paidAt
              ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                  new Date(payment.paidAt),
                )
              : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                  new Date(payment.createdAt),
                )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b py-6 text-sm">
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Received from</p>
          <p className="font-medium">{payment.patientName}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Invoice</p>
          <p>{payment.invoiceNumber ?? "—"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 py-6 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Method</span>
          <span>
            {(payment.paymentMethod as PaymentMethod) in paymentMethodLabels
              ? paymentMethodLabels[payment.paymentMethod as PaymentMethod]
              : payment.paymentMethod}
          </span>
        </div>
        {(payment.referenceNumber || payment.providerTransactionId) && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reference</span>
            <span>{payment.referenceNumber ?? payment.providerTransactionId}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <span>Amount received</span>
          <Money value={payment.amount} currency={payment.currency} />
        </div>
        {Number(payment.refundedAmount) > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Refunded</span>
              <span>
                -<Money value={payment.refundedAmount} currency={payment.currency} />
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Net received</span>
              <Money value={netReceived} currency={payment.currency} />
            </div>
          </>
        )}
      </div>

      <p className="text-muted-foreground border-t pt-4 text-center text-xs">Thank you.</p>
    </div>
  );
}
