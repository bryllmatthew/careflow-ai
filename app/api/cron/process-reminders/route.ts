import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate, type TemplateContext } from "@/lib/automation/render-template";
import { NotConfiguredProvider } from "@/lib/providers/messaging/not-configured";
import type { MessagingProvider, MessagingChannel } from "@/lib/providers/messaging/types";

/**
 * Sends `reminders` whose scheduled_for has arrived (docs/PRODUCT_SPEC.md
 * Phase 4 sections 21/38) -- deliberately NOT run inline with the
 * appointment mutation that scheduled them, so booking an appointment never
 * waits on a provider call.
 *
 * Meant to be invoked on an interval by Vercel Cron / pg_cron in
 * production (see vercel.json); there is no scheduler wired up in local dev,
 * so it's exercised by calling this endpoint directly (documented in the
 * Phase 4 report). Protected by a shared secret, not a user session --
 * there IS no end user for a scheduled job, which is also why this is the
 * one other legitimate service-role request-path exception alongside
 * app/(app)/settings/users/actions.ts (see eslint.config.mjs's allowlist
 * and CLAUDE.md's service-role rule) -- RLS has no auth.uid() to resolve
 * here, and this job must legitimately cross every organization's rows to
 * find what's due.
 */

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;
/** Minutes to push a retryable failure's scheduled_for forward before trying again. */
const RETRY_BACKOFF_MINUTES = 15;

/**
 * supabase-js's template-literal select-string parser can't resolve a
 * 3-level-deep embed with an aliased FK hint (it degenerates to
 * GenericStringError rather than the real shape) -- same limitation already
 * worked around in app/(app)/appointments/queries.ts. The query itself is
 * fine at runtime; only the compile-time inference gives up.
 */
type RawDueReminder = {
  id: string;
  organization_id: string;
  reminder_type: string;
  channel: string;
  retry_count: number;
  patients: { first_name: string; last_name: string; email: string | null; phone: string | null } | null;
  appointments: {
    start_at: string;
    clinics: { name: string; address: string | null; timezone: string } | null;
    staff: { full_name: string | null } | null;
    services: { name: string } | null;
  } | null;
};

function getProvider(channel: MessagingChannel): MessagingProvider {
  if (channel === "internal") {
    // Reminders never use 'internal' in practice (see dispatch.ts) -- this
    // branch exists only so a template misconfigured to 'internal' fails
    // honestly instead of silently mis-routing.
    return new NotConfiguredProvider("internal delivery for patient reminders");
  }
  return new NotConfiguredProvider(channel);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on the server." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: due, error: fetchError } = await supabase
    .from("reminders")
    .select(
      "id, organization_id, reminder_type, channel, retry_count, " +
        "patients(first_name, last_name, email, phone), " +
        "appointments(start_at, clinics(name, address, timezone), " +
        "staff:profiles!appointments_staff_id_fkey(full_name), services(name))",
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const dueReminders = (due ?? []) as unknown as RawDueReminder[];

  let sent = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  for (const reminder of dueReminders) {
    await supabase.from("reminders").update({ status: "processing" }).eq("id", reminder.id);

    const { data: template } = await supabase
      .from("reminder_templates")
      .select("subject, body, enabled")
      .eq("organization_id", reminder.organization_id)
      .eq("action_key", reminder.reminder_type)
      .eq("channel", reminder.channel)
      .maybeSingle();

    if (!template || !template.enabled) {
      await supabase
        .from("reminders")
        .update({ status: "skipped", failure_reason: "No enabled template for this reminder/channel." })
        .eq("id", reminder.id);
      skipped++;
      continue;
    }

    const appointment = reminder.appointments;
    const patient = reminder.patients;
    const clinic = appointment?.clinics;
    const timeZone = clinic?.timezone || "UTC";
    const startAt = appointment ? new Date(appointment.start_at) : null;

    const context: TemplateContext = {
      patient_name: patient ? `${patient.first_name} ${patient.last_name}` : undefined,
      clinic_name: clinic?.name ?? undefined,
      clinic_address: clinic?.address ?? undefined,
      practitioner_name: appointment?.staff?.full_name ?? undefined,
      service_name: appointment?.services?.name ?? undefined,
      appointment_date: startAt
        ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone }).format(startAt)
        : undefined,
      appointment_time: startAt
        ? new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone }).format(startAt)
        : undefined,
    };

    const body = renderTemplate(template.body, context);
    const subject = template.subject ? renderTemplate(template.subject, context) : undefined;
    const to = reminder.channel === "email" ? patient?.email : patient?.phone;

    if (!to) {
      await supabase
        .from("reminders")
        .update({
          status: "failed",
          failure_reason: `Patient has no ${reminder.channel === "email" ? "email address" : "phone number"} on file.`,
        })
        .eq("id", reminder.id);
      failed++;
      continue;
    }

    const provider = getProvider(reminder.channel as MessagingChannel);
    const result = await provider.send({ channel: reminder.channel as MessagingChannel, to, subject, body });

    if (result.success) {
      await supabase
        .from("reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", reminder.id);
      sent++;
      continue;
    }

    if (result.retryable && reminder.retry_count < MAX_RETRIES) {
      const nextAttempt = new Date(Date.now() + RETRY_BACKOFF_MINUTES * 60_000);
      await supabase
        .from("reminders")
        .update({
          status: "scheduled",
          retry_count: reminder.retry_count + 1,
          failure_reason: result.error,
          scheduled_for: nextAttempt.toISOString(),
        })
        .eq("id", reminder.id);
      retried++;
    } else {
      await supabase
        .from("reminders")
        .update({ status: "failed", failure_reason: result.error })
        .eq("id", reminder.id);
      failed++;
    }
  }

  return NextResponse.json({ processed: dueReminders.length, sent, failed, retried, skipped });
}
