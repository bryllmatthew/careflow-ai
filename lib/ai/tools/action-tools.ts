import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createAppointmentAction,
  rescheduleAppointmentAction,
} from "@/app/(app)/appointments/actions";
import { createFollowUpAction } from "@/app/(app)/followups/actions";
import { createInvoiceAction } from "@/app/(app)/invoices/actions";
import { recordManualPaymentAction } from "@/app/(app)/payments/actions";
import { createPurchaseOrderAction } from "@/app/(app)/purchase-orders/actions";
import { followUpTypes, followUpPriorities } from "@/lib/validation/followup.schema";
import { manualPaymentMethods } from "@/lib/validation/payment.schema";
import { defineActionTool, type ActionTool } from "./types";

/**
 * Every action tool here calls the SAME Server Action a human clicking a
 * button in the UI would call (CLAUDE.md section 66) -- never a parallel
 * write path, never a raw RPC the UI doesn't also use. `propose()` looks up
 * just enough display context to phrase a confirmation sentence (section 17)
 * WITHOUT performing the action; `execute()` is only ever called by
 * app/api/ai/actions/confirm/route.ts, after the user has explicitly
 * confirmed, and re-validates with the exact same Zod schema and
 * requirePermission() call the Server Action itself already enforces --
 * this file adds no new authorization surface, only a confirmation step in
 * front of an existing one.
 */

async function displayName(
  table: "patients" | "clinics" | "services" | "profiles" | "suppliers",
  id: string,
): Promise<string> {
  const supabase = await getSupabaseServerClient();
  if (table === "patients") {
    const { data } = await supabase
      .from("patients")
      .select("first_name, last_name")
      .eq("id", id)
      .maybeSingle();
    return data ? `${data.first_name} ${data.last_name}` : "Unknown patient";
  }
  if (table === "profiles") {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", id)
      .maybeSingle();
    return data?.full_name ?? data?.email ?? "Unknown staff member";
  }
  const { data } = await supabase.from(table).select("name").eq("id", id).maybeSingle();
  return data?.name ?? `Unknown ${table.slice(0, -1)}`;
}

export const createAppointmentTool = defineActionTool({
  name: "create_appointment",
  description:
    "Books a new appointment. Requires an existing patient, service, practitioner, and clinic -- look them up first if you only have names.",
  schema: z.object({
    patientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    staffId: z.string().uuid(),
    clinicId: z.string().uuid(),
    startAtIso: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date/time"),
    notes: z.string().max(2000).optional(),
  }),
  permission: "appointments.create",
  propose: async (input) => {
    const [patientName, staffName, clinicName] = await Promise.all([
      displayName("patients", input.patientId),
      displayName("profiles", input.staffId),
      displayName("clinics", input.clinicId),
    ]);
    const when = new Date(input.startAtIso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return {
      summary: `Book an appointment for ${patientName} with ${staffName} at ${clinicName} on ${when}?`,
      details: { patientName, staffName, clinicName, startAt: input.startAtIso },
    };
  },
  execute: async (input) => {
    const result = await createAppointmentAction({
      patientId: input.patientId,
      serviceId: input.serviceId,
      staffId: input.staffId,
      clinicId: input.clinicId,
      startAt: input.startAtIso,
      notes: input.notes,
    });
    return result.error
      ? { ok: false, error: result.error }
      : { ok: true, data: { created: true } };
  },
});

export const rescheduleAppointmentTool = defineActionTool({
  name: "reschedule_appointment",
  description: "Moves an existing appointment to a new date/time, keeping its original duration.",
  schema: z.object({
    appointmentId: z.string().uuid(),
    newStartAtIso: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date/time"),
  }),
  permission: "appointments.reschedule",
  propose: async (input) => {
    const when = new Date(input.newStartAtIso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return {
      summary: `Reschedule this appointment to ${when}?`,
      details: { appointmentId: input.appointmentId, newStartAt: input.newStartAtIso },
    };
  },
  execute: async (input) => {
    const result = await rescheduleAppointmentAction(input.appointmentId, input.newStartAtIso);
    return result.error
      ? { ok: false, error: result.error }
      : { ok: true, data: { rescheduled: true } };
  },
});

export const createFollowUpTool = defineActionTool({
  name: "create_followup",
  description: "Creates a follow-up task for a patient.",
  schema: z.object({
    patientId: z.string().uuid(),
    clinicId: z.string().uuid(),
    type: z.enum(followUpTypes),
    priority: z.enum(followUpPriorities),
    dueAtIso: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date/time"),
    assignedTo: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
  }),
  permission: "followups.create",
  propose: async (input) => {
    const patientName = await displayName("patients", input.patientId);
    const due = new Date(input.dueAtIso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return {
      summary: `Create a ${input.priority}-priority ${input.type} follow-up for ${patientName}, due ${due}?`,
      details: { patientName, type: input.type, priority: input.priority, dueAt: input.dueAtIso },
    };
  },
  execute: async (input) => {
    const result = await createFollowUpAction({
      patientId: input.patientId,
      clinicId: input.clinicId,
      type: input.type,
      priority: input.priority,
      dueAt: input.dueAtIso,
      assignedTo: input.assignedTo,
      notes: input.notes,
    });
    return result.error
      ? { ok: false, error: result.error }
      : { ok: true, data: { created: true } };
  },
});

export const createInvoiceTool = defineActionTool({
  name: "create_invoice",
  description:
    "Creates a draft invoice for a patient. Line items must be added separately in the app before issuing it -- this only creates the draft.",
  schema: z.object({
    patientId: z.string().uuid(),
    clinicId: z.string().uuid(),
    appointmentId: z.string().uuid().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    notes: z.string().max(2000).optional(),
  }),
  permission: "invoices.create",
  propose: async (input) => {
    const patientName = await displayName("patients", input.patientId);
    return {
      summary: `Create a draft invoice for ${patientName}? You'll still need to add line items and issue it in the app.`,
      details: { patientName },
    };
  },
  execute: async (input) => {
    const result = await createInvoiceAction({
      patientId: input.patientId,
      clinicId: input.clinicId,
      appointmentId: input.appointmentId,
      dueDate: input.dueDate,
      notes: input.notes,
    });
    return result.success
      ? { ok: true, data: { invoiceId: result.invoiceId } }
      : { ok: false, error: result.error };
  },
});

export const recordPaymentTool = defineActionTool({
  name: "record_payment",
  description:
    "Records a manual payment (cash, card terminal, bank transfer, etc.) against an existing invoice. A financial action -- always confirm the exact amount with the user first.",
  schema: z.object({
    invoiceId: z.string().uuid(),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount, e.g. 1500.00"),
    paymentMethod: z.enum(manualPaymentMethods),
    referenceNumber: z.string().max(200).optional(),
  }),
  permission: "payments.record_manual",
  propose: async (input, ctx) => {
    return {
      summary: `Record a ${ctx.currency} ${input.amount} payment (${input.paymentMethod}) against this invoice?`,
      details: { amount: input.amount, method: input.paymentMethod },
    };
  },
  execute: async (input) => {
    const result = await recordManualPaymentAction(input.invoiceId, {
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
    });
    return result.success
      ? { ok: true, data: { paymentId: result.paymentId } }
      : { ok: false, error: result.error };
  },
});

export const createPurchaseOrderTool = defineActionTool({
  name: "create_purchase_order",
  description:
    "Creates a draft purchase order for a supplier. Line items must be added separately in the app before ordering -- this only creates the draft.",
  schema: z.object({
    clinicId: z.string().uuid(),
    supplierId: z.string().uuid(),
    expectedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    notes: z.string().max(1000).optional(),
  }),
  permission: "purchase_orders.manage",
  propose: async (input) => {
    const supplierName = await displayName("suppliers", input.supplierId);
    return {
      summary: `Create a draft purchase order for ${supplierName}? You'll still need to add line items and place the order in the app.`,
      details: { supplierId: input.supplierId },
    };
  },
  execute: async (input) => {
    const result = await createPurchaseOrderAction({
      clinicId: input.clinicId,
      supplierId: input.supplierId,
      expectedDate: input.expectedDate,
      notes: input.notes,
    });
    return result.success
      ? { ok: true, data: { purchaseOrderId: result.purchaseOrderId } }
      : { ok: false, error: result.error };
  },
});

export const sendReminderTool = defineActionTool({
  name: "send_reminder",
  description:
    "Sends a pending scheduled reminder to a patient right away, instead of waiting for its scheduled time.",
  schema: z.object({ reminderId: z.string().uuid() }),
  permission: "reminders.manage",
  propose: async (input) => {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase
      .from("reminders")
      .select("reminder_type, channel, status, patients(first_name, last_name)")
      .eq("id", input.reminderId)
      .maybeSingle();
    if (!data)
      return {
        summary: "This reminder was not found, or you don't have access to it.",
        details: {},
      };
    if (data.status !== "scheduled") {
      return {
        summary: `This reminder is already ${data.status}, not pending.`,
        details: { status: data.status },
      };
    }
    const patientName = data.patients
      ? `${data.patients.first_name} ${data.patients.last_name}`
      : "the patient";
    return {
      summary: `Send this ${data.reminder_type.replace("_", " ")} reminder to ${patientName} right now, via ${data.channel}?`,
      details: { reminderType: data.reminder_type, channel: data.channel, patientName },
    };
  },
  execute: async (input) => {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("reminders")
      .update({ scheduled_for: new Date().toISOString() })
      .eq("id", input.reminderId)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data)
      return { ok: false, error: "Reminder not found, already sent, or no longer pending." };
    return { ok: true, data: { queued: true } };
  },
});

export const actionTools: ActionTool[] = [
  createAppointmentTool,
  rescheduleAppointmentTool,
  createFollowUpTool,
  createInvoiceTool,
  recordPaymentTool,
  createPurchaseOrderTool,
  sendReminderTool,
];
