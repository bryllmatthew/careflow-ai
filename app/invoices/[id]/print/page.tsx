import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getInvoiceById } from "@/app/(app)/invoices/queries";
import { Money } from "@/components/patterns/money";
import { PrintButton } from "./print-button";

/**
 * Deliberately outside the (app) route group so it renders with none of the
 * app shell's sidebar/topbar chrome (docs/PRODUCT_SPEC.md Phase 5 section
 * 22: "a professional printable invoice layout"). Still auth-gated -- this
 * route sits outside (app)/layout.tsx's redirect-to-login, so it does its
 * own -- and getInvoiceById() is still the real access check via RLS.
 */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const supabase = await getSupabaseServerClient();
  const [{ data: clinic }, { data: org }] = await Promise.all([
    supabase
      .from("clinics")
      .select("name, address, phone, email")
      .eq("id", invoice.clinicId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", auth.memberships[0]!.organizationId)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-8 print:p-0">
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
          <h2 className="text-lg font-semibold">Invoice</h2>
          <p className="text-muted-foreground text-sm">{invoice.invoiceNumber ?? "Draft"}</p>
          <p className="text-muted-foreground text-sm">
            {invoice.issueDate
              ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                  new Date(invoice.issueDate),
                )
              : "Not yet issued"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b py-6 text-sm">
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Billed to</p>
          <p className="font-medium">{invoice.patientName}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Due date</p>
          <p>
            {invoice.dueDate
              ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                  new Date(invoice.dueDate),
                )
              : "—"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs font-medium uppercase">Status</p>
          <p className="capitalize">
            {invoice.isOverdue ? "Overdue" : invoice.status.replaceAll("_", " ")}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse py-6 text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit Price</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">
                <Money value={item.unitPrice} currency={invoice.currency} />
              </td>
              <td className="py-2 text-right">
                <Money value={item.lineTotal} currency={invoice.currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto flex w-56 flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <Money value={invoice.subtotal} currency={invoice.currency} />
        </div>
        {Number(invoice.discountAmount) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span>
              -<Money value={invoice.discountAmount} currency={invoice.currency} />
            </span>
          </div>
        )}
        {Number(invoice.taxAmount) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
            <Money value={invoice.taxAmount} currency={invoice.currency} />
          </div>
        )}
        <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
          <span>Total</span>
          <Money value={invoice.total} currency={invoice.currency} />
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount paid</span>
          <Money value={invoice.amountPaid} currency={invoice.currency} />
        </div>
        <div className="flex justify-between font-medium">
          <span>Balance due</span>
          <Money value={invoice.balance} currency={invoice.currency} />
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-6 border-t pt-4 text-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Notes</p>
          <p className="whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {invoice.status === "void" && (
        <div className="text-destructive mt-6 border-t pt-4 text-center text-sm font-medium uppercase">
          Void{invoice.voidReason ? ` — ${invoice.voidReason}` : ""}
        </div>
      )}
    </div>
  );
}
