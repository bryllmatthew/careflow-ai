import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPatients, getPatientById } from "@/app/(app)/patients/queries";
import { listPatientAppointments } from "@/app/(app)/appointments/queries";
import { listPatientFollowUps } from "@/app/(app)/followups/queries";
import { defineReadTool } from "./types";
import { clinicIdSchema, resolveClinicId } from "./shared";

export const searchPatientsTool = defineReadTool({
  name: "search_patients",
  description:
    "Searches patients by name, phone, or email. Returns only patients the requesting user is authorized to see.",
  schema: z.object({
    query: z.string().min(1).describe("Name, phone, or email fragment to search for."),
    clinicId: clinicIdSchema,
  }),
  permission: ["patients.view", "patients.view.assigned"],
  handler: async (input, ctx) => {
    const clinicId = resolveClinicId(input.clinicId, ctx);
    const result = await listPatients(ctx.organizationId, { q: input.query, clinicId });
    return { ok: true, data: { total: result.total, patients: result.rows.slice(0, 20) } };
  },
});

/**
 * Field projection by permission (docs/AI_TOOLS.md section 10 -- "returns
 * only information appropriate to the requesting user's permissions"):
 * demographics are always included once patients.view/patients.view.assigned
 * has already gated the call; appointment history requires appointments.view,
 * follow-ups require followups.view, and financial data (invoices/balance)
 * requires reports.financial -- never bundled in unconditionally.
 */
export const getPatientTool = defineReadTool({
  name: "get_patient",
  description:
    "Gets a single patient's details: contact info, plus appointment history, follow-ups, and financial summary, each only if the requesting user holds the relevant permission.",
  schema: z.object({ patientId: z.string().uuid() }),
  permission: ["patients.view", "patients.view.assigned"],
  handler: async (input, ctx) => {
    const patient = await getPatientById(input.patientId);
    if (!patient) return { ok: false, error: "Patient not found, or you don't have access to it." };

    const [appointments, followUps, financial] = await Promise.all([
      ctx.permissions.has("appointments.view")
        ? listPatientAppointments(input.patientId)
        : Promise.resolve(undefined),
      ctx.permissions.has("followups.view")
        ? listPatientFollowUps(input.patientId)
        : Promise.resolve(undefined),
      ctx.permissions.has("reports.financial")
        ? getPatientFinancialSummary(input.patientId)
        : Promise.resolve(undefined),
    ]);

    return {
      ok: true,
      data: {
        patient,
        recentAppointments: appointments?.slice(0, 10),
        followUps: followUps?.slice(0, 10),
        financial,
      },
    };
  },
});

async function getPatientFinancialSummary(patientId: string) {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, amount_paid, balance")
    .eq("patient_id", patientId)
    .order("issue_date", { ascending: false })
    .limit(10);

  const rows = data ?? [];
  return {
    outstandingBalance: rows.reduce((sum, r) => sum + (r.balance ?? 0), 0).toFixed(2),
    recentInvoices: rows.map((r) => ({
      invoiceNumber: r.invoice_number,
      status: r.status,
      total: r.total.toFixed(2),
      amountPaid: r.amount_paid.toFixed(2),
      balance: (r.balance ?? 0).toFixed(2),
    })),
  };
}

export const getPatientHistoryTool = defineReadTool({
  name: "get_patient_history",
  description: "A patient's appointment and follow-up history, most recent first.",
  schema: z.object({ patientId: z.string().uuid() }),
  permission: ["patients.view", "patients.view.assigned"],
  handler: async (input, ctx) => {
    const patient = await getPatientById(input.patientId);
    if (!patient) return { ok: false, error: "Patient not found, or you don't have access to it." };

    const [appointments, followUps] = await Promise.all([
      listPatientAppointments(input.patientId),
      ctx.permissions.has("followups.view")
        ? listPatientFollowUps(input.patientId)
        : Promise.resolve([]),
    ]);

    return {
      ok: true,
      data: {
        patientName: `${patient.firstName} ${patient.lastName}`,
        appointments: appointments.slice(0, 20),
        followUps: followUps.slice(0, 20),
      },
    };
  },
});
