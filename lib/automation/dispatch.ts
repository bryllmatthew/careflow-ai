import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.generated";

export type AppointmentTriggerType =
  | "appointment.created"
  | "appointment.confirmed"
  | "appointment.rescheduled"
  | "appointment.completed"
  | "appointment.no_show";

export type InvoiceTriggerType =
  "invoice.created" | "invoice.issued" | "invoice.overdue" | "invoice.voided";

export type InvoiceContext = {
  id: string;
  organizationId: string;
  clinicId: string;
  patientId: string;
};

/** What createFollowUp actually needs -- a follow-up may trace back to an appointment, an invoice, or (in principle) neither. */
type FollowUpSourceContext = {
  organizationId: string;
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  invoiceId?: string;
};

type FollowupConfig = { followup_type: string; due_in_hours?: number; priority?: string };

/** Postgres unique_violation -- the idempotency mechanism, not an error to surface. */
const UNIQUE_VIOLATION = "23505";

/**
 * The automation engine's entry point, called from
 * app/(app)/appointments/actions.ts right after an appointment mutation
 * commits. Looks up this organization's ENABLED automation_rules for the
 * given trigger and executes each: 'reminder' rules upsert a `reminders`
 * row, 'followup' rules upsert a `follow_ups` row. Both upserts rely on a
 * unique partial index (migration 0014) for idempotency -- running the same
 * trigger twice (a retried request, a duplicate call) can never create a
 * duplicate reminder or follow-up.
 *
 * As of Phase 10 the rule loop itself lives in SQL
 * (public.run_appointment_automation, migration 0020) and this is a thin
 * wrapper over it. The move was forced by a real requirement, not a
 * refactor for its own sake: a public booking (app/book/[slug]) has no
 * signed-in caller at all, so the TypeScript version -- which depended on
 * the caller's own INSERT rights on reminders/follow_ups -- could not run
 * for it. Rather than write a second copy of the rule loop for the
 * anonymous path, the loop moved to a SECURITY DEFINER function both paths
 * call. One engine, two entry points, exactly as
 * docs/modules/ONLINE_BOOKING.md describes for booking itself.
 *
 * Still deliberately synchronous with the caller and still cheap: it only
 * writes rows, never calls an external provider. Actual message delivery is
 * the processor's job (app/api/cron/process-reminders), which runs later and
 * asynchronously -- see docs/PRODUCT_SPEC.md Phase 4 section 38
 * ("appointment creation must not wait for SMS/email delivery").
 */
export async function dispatchAppointmentEvent(
  supabase: SupabaseClient<Database>,
  trigger: AppointmentTriggerType,
  appointmentId: string,
): Promise<void> {
  const { error } = await supabase.rpc("run_appointment_automation", {
    p_appointment_id: appointmentId,
    p_trigger: trigger,
  });

  if (error) {
    throw new Error(`Automation dispatch failed for ${trigger}: ${error.message}`);
  }
}

/**
 * The invoice-side counterpart, called from app/(app)/invoices/actions.ts.
 * Only action_type='followup' rules exist for invoice.* triggers today
 * (migration 0015's seed: invoice.overdue -> a 'payment' follow-up) -- no
 * invoice-triggered reminder exists yet, so this stayed in TypeScript when
 * the appointment side moved to SQL: there is no anonymous invoice path that
 * would force the same move, and moving it anyway would be churn.
 */
export async function dispatchInvoiceEvent(
  supabase: SupabaseClient<Database>,
  trigger: InvoiceTriggerType,
  invoice: InvoiceContext,
): Promise<void> {
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("id, action_type, config")
    .eq("organization_id", invoice.organizationId)
    .eq("trigger_type", trigger)
    .eq("enabled", true);

  for (const rule of rules ?? []) {
    if (rule.action_type === "followup") {
      await createFollowUp(
        supabase,
        { ...invoice, invoiceId: invoice.id },
        rule.id,
        rule.config as FollowupConfig,
      );
    }
  }
}

async function createFollowUp(
  supabase: SupabaseClient<Database>,
  source: FollowUpSourceContext,
  ruleId: string,
  config: FollowupConfig,
): Promise<void> {
  const dueAt = new Date(Date.now() + (config.due_in_hours ?? 24) * 3_600_000);

  const { error } = await supabase.from("follow_ups").insert({
    organization_id: source.organizationId,
    clinic_id: source.clinicId,
    patient_id: source.patientId,
    appointment_id: source.appointmentId,
    invoice_id: source.invoiceId,
    automation_rule_id: ruleId,
    type: config.followup_type,
    due_at: dueAt.toISOString(),
    priority: config.priority ?? "normal",
  });

  if (error && error.code !== UNIQUE_VIOLATION) {
    throw new Error(`Failed to create ${config.followup_type} follow-up: ${error.message}`);
  }
}

/**
 * When an invoice becomes fully paid, any open "payment" follow-up tied to
 * it (created by the invoice.overdue automation, migration 0015's seed) is
 * resolved automatically -- docs/PRODUCT_SPEC.md Phase 6 section 37: "when
 * an invoice becomes paid, related payment follow-ups may be resolved."
 * A direct cleanup step, not routed through the generic automation_rules
 * engine -- there's nothing to configure or toggle about it, unlike the
 * reminder/follow-up *creation* rules that engine exists for.
 */
export async function resolvePaymentFollowUps(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
): Promise<void> {
  await supabase
    .from("follow_ups")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("invoice_id", invoiceId)
    .eq("type", "payment")
    .in("status", ["pending", "in_progress"]);
}

/**
 * Cancels every not-yet-sent reminder for an appointment. Called on both
 * cancellation and reschedule (docs/PRODUCT_SPEC.md Phase 4 section 19):
 * "cancel obsolete scheduled reminders... do not send reminders for the old
 * time... preserve historical sent reminders." Only 'scheduled' rows are
 * touched -- a reminder already 'sent' stays exactly as it is, since it's
 * now history, not a pending action.
 */
export async function cancelScheduledReminders(
  supabase: SupabaseClient<Database>,
  appointmentId: string,
): Promise<void> {
  await supabase
    .from("reminders")
    .update({ status: "cancelled" })
    .eq("appointment_id", appointmentId)
    .eq("status", "scheduled");
}

export type NotificationType =
  | "followup_due"
  | "followup_overdue"
  | "reminder_failed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "no_show_followup_created"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "inventory_consumption_failed";

/**
 * Wraps public.create_notification() (migration 0014, SECURITY DEFINER) --
 * never fails the caller's action if it errors (e.g. the recipient turns
 * out not to be an active org member any more), same "automation is a side
 * effect, not the point of the request" rule as safeDispatch in
 * app/(app)/appointments/actions.ts.
 */
export async function notifyUser(
  supabase: SupabaseClient<Database>,
  params: {
    organizationId: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
  },
): Promise<void> {
  try {
    await supabase.rpc("create_notification", {
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
    });
  } catch (err) {
    console.error(`[automation] notifyUser failed (${params.type}):`, err);
  }
}
