"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError, UnauthenticatedError } from "@/lib/auth/errors";
import {
  appointmentFormSchema,
  type AppointmentFormInput,
  type AppointmentStatus,
} from "@/lib/validation/appointment.schema";
import {
  cancelScheduledReminders,
  dispatchAppointmentEvent,
  notifyUser,
  type AppointmentContext,
  type AppointmentTriggerType,
} from "@/lib/automation/dispatch";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

/** Postgres exclusion-violation -- the appointments_no_staff_overlap constraint (migration 0013). */
const OVERLAP_SQLSTATE = "23P01";
const DOUBLE_BOOKING_MESSAGE = "This practitioner is already booked during that time.";

type ActionResult = { error: string } | { error?: undefined };

/**
 * Automation is a side effect of a successful appointment mutation, not the
 * point of the request -- a failure here must never fail the appointment
 * action itself (docs/PRODUCT_SPEC.md Phase 4 section 38). Logged server-side
 * so it's diagnosable without an execution-log UI having to exist yet.
 */
async function safeDispatch(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  trigger: AppointmentTriggerType,
  appointment: AppointmentContext,
) {
  try {
    await dispatchAppointmentEvent(supabase, trigger, appointment);
  } catch (err) {
    console.error(`[automation] dispatch failed for ${trigger} on appointment ${appointment.id}:`, err);
  }
}

export async function createAppointmentAction(input: AppointmentFormInput): Promise<ActionResult> {
  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("appointments.create", {
    organizationId,
    clinicId: parsed.data.clinicId,
  });

  const supabase = await getSupabaseServerClient();

  // Duration comes from the service record, never a client-supplied value --
  // otherwise a forged short duration could hide a real conflict from the
  // EXCLUDE constraint by shrinking the booked range.
  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", parsed.data.serviceId)
    .maybeSingle();

  if (serviceError || !service) {
    return { error: "Service not found, or you don't have access to it." };
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(startAt.getTime() + service.duration_minutes * 60_000);

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      clinic_id: parsed.data.clinicId,
      patient_id: parsed.data.patientId,
      service_id: parsed.data.serviceId,
      staff_id: parsed.data.staffId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      notes: parsed.data.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.code === OVERLAP_SQLSTATE ? DOUBLE_BOOKING_MESSAGE : error.message };
  }

  await safeDispatch(supabase, "appointment.created", {
    id: appointment.id,
    organizationId,
    clinicId: parsed.data.clinicId,
    patientId: parsed.data.patientId,
    startAt: startAt.toISOString(),
  });

  revalidatePath("/calendar");
  revalidatePath("/appointments");
  return {};
}

/**
 * Moves an appointment to a new start time, keeping its existing duration.
 * This app never leaves a stale 'rescheduled' row behind -- see migration
 * 0013's header comment -- it mutates start_at/end_at on the same row.
 */
export async function rescheduleAppointmentAction(
  appointmentId: string,
  newStartAtISO: string,
): Promise<ActionResult> {
  if (Number.isNaN(Date.parse(newStartAtISO))) {
    return { error: "Enter a valid date and time." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("appointments.reschedule", { organizationId });

  const supabase = await getSupabaseServerClient();

  const { data: current, error: fetchError } = await supabase
    .from("appointments")
    .select("start_at, end_at, clinic_id, patient_id, staff_id, patients(first_name, last_name)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (fetchError || !current) {
    return { error: "Appointment not found, or you don't have access to it." };
  }

  const durationMs = new Date(current.end_at).getTime() - new Date(current.start_at).getTime();
  const newStartAt = new Date(newStartAtISO);
  const newEndAt = new Date(newStartAt.getTime() + durationMs);

  const { data, error } = await supabase
    .from("appointments")
    .update({ start_at: newStartAt.toISOString(), end_at: newEndAt.toISOString() })
    .eq("id", appointmentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: error.code === OVERLAP_SQLSTATE ? DOUBLE_BOOKING_MESSAGE : error.message };
  }
  if (!data) {
    return { error: "Appointment not found, or you don't have access to it." };
  }

  // The old time's reminders are now meaningless -- cancel whatever hasn't
  // sent yet, then re-run scheduling against the new time. A 'confirmation'
  // reminder isn't re-created here: only 'appointment.rescheduled' rules
  // exist for the 24h/2h reminders (migration 0014's seed), so this can
  // never duplicate the one-time booking confirmation.
  await cancelScheduledReminders(supabase, appointmentId);
  await safeDispatch(supabase, "appointment.rescheduled", {
    id: appointmentId,
    organizationId,
    clinicId: current.clinic_id,
    patientId: current.patient_id,
    startAt: newStartAt.toISOString(),
  });

  // The receptionist/manager who rescheduled is never the practitioner
  // themselves -- appointments.reschedule isn't granted to the practitioner
  // role (migration 0002) -- so this always has a real, distinct recipient.
  const patientName = current.patients
    ? `${current.patients.first_name} ${current.patients.last_name}`
    : "A patient";
  await notifyUser(supabase, {
    organizationId,
    userId: current.staff_id,
    type: "appointment_rescheduled",
    title: "Appointment rescheduled",
    message: `${patientName}'s appointment was moved to ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(newStartAt)}.`,
    entityType: "appointment",
    entityId: appointmentId,
  });

  revalidatePath("/calendar");
  revalidatePath("/appointments");
  return {};
}

const STATUS_TRIGGERS: Partial<Record<AppointmentStatus, AppointmentTriggerType>> = {
  confirmed: "appointment.confirmed",
  completed: "appointment.completed",
  no_show: "appointment.no_show",
};

export async function updateAppointmentStatusAction(
  appointmentId: string,
  status: AppointmentStatus,
) {
  const organizationId = await currentOrganizationId();
  await requirePermission("appointments.update", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .select("id, clinic_id, patient_id, staff_id, start_at, patients(first_name, last_name)")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Appointment not found, or you don't have access to it.");

  const trigger = STATUS_TRIGGERS[status];
  if (trigger) {
    await safeDispatch(supabase, trigger, {
      id: data.id,
      organizationId,
      clinicId: data.clinic_id,
      patientId: data.patient_id,
      startAt: data.start_at,
    });
  }

  if (status === "no_show") {
    const patientName = data.patients
      ? `${data.patients.first_name} ${data.patients.last_name}`
      : "A patient";
    await notifyUser(supabase, {
      organizationId,
      userId: data.staff_id,
      type: "no_show_followup_created",
      title: "No-show follow-up created",
      message: `${patientName} was marked as a no-show. A follow-up has been created.`,
      entityType: "appointment",
      entityId: data.id,
    });
  }

  revalidatePath("/calendar");
  revalidatePath("/appointments");
}

export async function cancelAppointmentAction(appointmentId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("appointments.cancel", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .select("id, staff_id, patients(first_name, last_name)")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Appointment not found, or you don't have access to it.");

  // No future reminder should fire for a cancelled appointment
  // (docs/PRODUCT_SPEC.md Phase 4 section 19) -- already-sent ones stay put.
  await cancelScheduledReminders(supabase, appointmentId);

  const patientName = data.patients ? `${data.patients.first_name} ${data.patients.last_name}` : "A patient";
  await notifyUser(supabase, {
    organizationId,
    userId: data.staff_id,
    type: "appointment_cancelled",
    title: "Appointment cancelled",
    message: `${patientName}'s appointment was cancelled.`,
    entityType: "appointment",
    entityId: data.id,
  });

  revalidatePath("/calendar");
  revalidatePath("/appointments");
}
