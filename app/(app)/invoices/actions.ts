"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError, UnauthenticatedError, ForbiddenError } from "@/lib/auth/errors";
import {
  createInvoiceSchema,
  invoiceItemSchema,
  discountSchema,
  taxSchema,
  type CreateInvoiceInput,
  type InvoiceItemInput,
  type DiscountInput,
} from "@/lib/validation/invoice.schema";
import { dispatchInvoiceEvent } from "@/lib/automation/dispatch";
import type { Database, Json } from "@/lib/db/types.generated";

type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

type ActionResult = { error: string } | { error?: undefined };

// A literal `success` discriminant, not a shared `ActionResult` with an
// optional invoiceId bolted on -- TypeScript's control-flow narrowing
// doesn't reliably exclude an `{ error: string }` arm just because
// `result.error` was falsy (an empty string still satisfies `string`), so
// `if (result.error) return; ...use result.invoiceId` would not narrow
// cleanly against a non-literal discriminant. A literal boolean does.
type CreateInvoiceResult = { success: true; invoiceId: string } | { success: false; error: string };

/** Audit logging is a side effect, never worth failing the caller's action over. */
async function safeAudit(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  organizationId: string,
  action: string,
  entityId: string,
  metadata: Record<string, Json> = {},
) {
  try {
    await supabase.rpc("log_audit_event", {
      p_organization_id: organizationId,
      p_action: action,
      p_entity_type: "invoices",
      p_entity_id: entityId,
      p_metadata: metadata,
    });
  } catch (err) {
    console.error(`[audit] log_audit_event failed (${action}):`, err);
  }
}

export async function createInvoiceAction(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.create", { organizationId, clinicId: parsed.data.clinicId });

  const supabase = await getSupabaseServerClient();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      organization_id: organizationId,
      clinic_id: parsed.data.clinicId,
      patient_id: parsed.data.patientId,
      appointment_id: parsed.data.appointmentId ?? null,
      due_date: parsed.data.dueDate ?? null,
      notes: parsed.data.notes ?? null,
      created_by: (await getAuthContext())?.userId ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await dispatchInvoiceEvent(supabase, "invoice.created", {
    id: invoice.id,
    organizationId,
    clinicId: parsed.data.clinicId,
    patientId: parsed.data.patientId,
  });
  await safeAudit(supabase, organizationId, "invoice.created", invoice.id);

  revalidatePath("/invoices");
  return { success: true, invoiceId: invoice.id };
}

/**
 * Pre-populates a draft invoice from a completed (or any) appointment: the
 * patient, clinic and appointment link are set, and the appointment's
 * service becomes the first line item at today's price -- the user still
 * reviews and can change everything before issuing
 * (docs/PRODUCT_SPEC.md Phase 5 section 8: "do not automatically charge the
 * patient").
 */
export async function createInvoiceFromAppointmentAction(
  appointmentId: string,
): Promise<CreateInvoiceResult> {
  const organizationId = await currentOrganizationId();
  const supabase = await getSupabaseServerClient();

  const { data: appointment, error: fetchError } = await supabase
    .from("appointments")
    .select("clinic_id, patient_id, services(id, name, price)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (fetchError || !appointment) {
    return { success: false, error: "Appointment not found, or you don't have access to it." };
  }

  await requirePermission("invoices.create", { organizationId, clinicId: appointment.clinic_id });

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      organization_id: organizationId,
      clinic_id: appointment.clinic_id,
      patient_id: appointment.patient_id,
      appointment_id: appointmentId,
      created_by: (await getAuthContext())?.userId ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  if (appointment.services) {
    await supabase.from("invoice_items").insert({
      invoice_id: invoice.id,
      organization_id: organizationId,
      clinic_id: appointment.clinic_id,
      service_id: appointment.services.id,
      description: appointment.services.name,
      quantity: 1,
      unit_price: appointment.services.price,
    });
  }

  await dispatchInvoiceEvent(supabase, "invoice.created", {
    id: invoice.id,
    organizationId,
    clinicId: appointment.clinic_id,
    patientId: appointment.patient_id,
  });
  await safeAudit(supabase, organizationId, "invoice.created", invoice.id, {
    source: "appointment",
    appointmentId,
  });

  revalidatePath("/invoices");
  return { success: true, invoiceId: invoice.id };
}

export async function addInvoiceItemAction(
  invoiceId: string,
  input: InvoiceItemInput,
): Promise<ActionResult> {
  const parsed = invoiceItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.update", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("clinic_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found, or you don't have access to it." };

  const { error } = await supabase.from("invoice_items").insert({
    invoice_id: invoiceId,
    organization_id: organizationId,
    clinic_id: invoice.clinic_id,
    service_id: parsed.data.serviceId ?? null,
    description: parsed.data.description,
    quantity: parsed.data.quantity,
    unit_price: Number(parsed.data.unitPrice),
  });

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "This invoice can no longer be edited (it's not a draft)."
          : error.message,
    };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

export async function updateInvoiceItemAction(
  itemId: string,
  invoiceId: string,
  input: InvoiceItemInput,
): Promise<ActionResult> {
  const parsed = invoiceItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.update", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .update({
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit_price: Number(parsed.data.unitPrice),
    })
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "This line can no longer be edited (the invoice is not a draft)." };

  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

export async function removeInvoiceItemAction(itemId: string, invoiceId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.update", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .delete()
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data)
    throw new ForbiddenError("This line can no longer be removed (the invoice is not a draft).");

  revalidatePath(`/invoices/${invoiceId}`);
}

export async function updateInvoiceDetailsAction(
  invoiceId: string,
  updates: { dueDate?: string; notes?: string; taxRate?: number },
): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.update", { organizationId });

  if (updates.taxRate !== undefined) {
    const parsedTax = taxSchema.safeParse({ taxRate: updates.taxRate });
    if (!parsedTax.success) {
      return { error: parsedTax.error.issues[0]?.message ?? "Invalid tax rate." };
    }
  }

  const supabase = await getSupabaseServerClient();
  const patch: InvoiceUpdate = {};
  if (updates.dueDate !== undefined) patch.due_date = updates.dueDate || null;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;
  if (updates.taxRate !== undefined) patch.tax_rate = updates.taxRate;

  const { data, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Invoice not found, or you don't have access to it." };

  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

export async function applyDiscountAction(
  invoiceId: string,
  input: DiscountInput,
): Promise<ActionResult> {
  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid discount." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.apply_discount", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({
      discount_type: parsed.data.discountType,
      discount_value: parsed.data.discountType ? Number(parsed.data.discountValue) : null,
    })
    .eq("id", invoiceId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Invoice not found, or you don't have access to it." };

  await safeAudit(supabase, organizationId, "invoice.discount_applied", invoiceId, {
    discountType: parsed.data.discountType,
    discountValue: parsed.data.discountValue ?? null,
  });

  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

export async function issueInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.issue", { organizationId });

  const supabase = await getSupabaseServerClient();

  const { data: current } = await supabase
    .from("invoices")
    .select("status, subtotal, clinic_id, patient_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!current) return { error: "Invoice not found, or you don't have access to it." };
  if (current.status !== "draft") return { error: "Only a draft invoice can be issued." };
  if (current.subtotal <= 0) return { error: "Add at least one item before issuing." };

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "issued" })
    .eq("id", invoiceId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Invoice not found, or you don't have access to it." };

  await dispatchInvoiceEvent(supabase, "invoice.issued", {
    id: invoiceId,
    organizationId,
    clinicId: current.clinic_id,
    patientId: current.patient_id,
  });
  await safeAudit(supabase, organizationId, "invoice.issued", invoiceId);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

export async function cancelDraftInvoiceAction(invoiceId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.update", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data: current } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!current) throw new NotFoundError("Invoice not found, or you don't have access to it.");
  if (current.status !== "draft")
    throw new ForbiddenError("Only a draft invoice can be cancelled this way.");

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Invoice not found, or you don't have access to it.");

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function voidInvoiceAction(invoiceId: string, reason: string): Promise<ActionResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "A reason is required to void an invoice." };

  const organizationId = await currentOrganizationId();
  await requirePermission("invoices.void", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data: current } = await supabase
    .from("invoices")
    .select("status, clinic_id, patient_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!current) return { error: "Invoice not found, or you don't have access to it." };
  if (!["issued", "overdue", "partially_paid"].includes(current.status)) {
    return { error: "Only an issued invoice can be voided." };
  }

  const auth = await getAuthContext();
  const { data, error } = await supabase
    .from("invoices")
    .update({
      status: "void",
      void_reason: trimmedReason,
      voided_by: auth?.userId ?? null,
      voided_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Invoice not found, or you don't have access to it." };

  await dispatchInvoiceEvent(supabase, "invoice.voided", {
    id: invoiceId,
    organizationId,
    clinicId: current.clinic_id,
    patientId: current.patient_id,
  });
  await safeAudit(supabase, organizationId, "invoice.voided", invoiceId, { reason: trimmedReason });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}
