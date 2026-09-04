import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchInvoiceEvent } from "@/lib/automation/dispatch";

/**
 * "Overdue" is never a status a client sets (see app/(app)/invoices/queries.ts's
 * isOverdue() -- it's computed at read time from status/due_date/balance so it
 * can never drift). This job exists for exactly one reason: to persist the
 * transition once and dispatch invoice.overdue exactly once per invoice,
 * matching docs/PRODUCT_SPEC.md Phase 5 section 35 ("prepare the system for
 * invoice.overdue automation"). Setting status='overdue' also makes the
 * invoice's own row queryable by status without recomputing the date
 * comparison everywhere.
 *
 * Same shared-secret, no-end-user shape as
 * app/api/cron/process-reminders -- see that route's comment and
 * eslint.config.mjs's service-role allowlist for why this is a legitimate
 * service-role exception.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on the server." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: newlyOverdue, error } = await supabase
    .from("invoices")
    .select("id, organization_id, clinic_id, patient_id")
    .eq("status", "issued")
    .lt("due_date", today)
    .gt("balance", 0);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let marked = 0;
  for (const invoice of newlyOverdue ?? []) {
    // .eq("status", "issued") plus checking a row actually came back is
    // what makes this safe under two concurrent runs: if another run
    // already flipped this invoice to 'overdue' between the SELECT above
    // and this UPDATE, this one matches 0 rows and must NOT dispatch a
    // second invoice.overdue for it (docs/PRODUCT_SPEC.md Phase 5 section
    // 32/44 -- concurrent jobs must not duplicate automation).
    const { data: updated, error: updateError } = await supabase
      .from("invoices")
      .update({ status: "overdue" })
      .eq("id", invoice.id)
      .eq("status", "issued")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) continue;
    marked++;

    await dispatchInvoiceEvent(supabase, "invoice.overdue", {
      id: invoice.id,
      organizationId: invoice.organization_id,
      clinicId: invoice.clinic_id,
      patientId: invoice.patient_id,
    });
  }

  return NextResponse.json({ checked: newlyOverdue?.length ?? 0, marked });
}
