"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import type { Permission } from "@/lib/auth/permissions";
import { getClinicDentalContext } from "@/lib/dental/queries";
import {
  recordConditionsSchema,
  conditionStatusSchema,
  planTreatmentSchema,
  closeTreatmentSchema,
  type RecordConditionsInput,
  type ConditionStatusInput,
  type PlanTreatmentInput,
  type CloseTreatmentInput,
} from "@/lib/validation/dental.schema";

/**
 * Dental writes. Each one resolves the patient's clinic server-side, refuses
 * early if that clinic is not a dental clinic or the caller lacks the
 * permission, then calls one RPC.
 *
 * Those early refusals are for a readable message, not for security: the
 * database enforces all of it again -- RLS on permission, clinic capability
 * and patient visibility, and triggers on the clinical state machine
 * (migration 0025) -- whatever path a write takes.
 */

type Result = { error?: string };

const NOT_DENTAL = "Dental charting is only available for dental clinics.";
const FORBIDDEN = "You don't have permission to change this patient's dental chart.";

/** Maps a database refusal to something a clinician can act on. */
function explain(error: { code?: string; message: string }): string {
  // Row-level security refusals carry no useful text for a person.
  if (error.code === "42501" && /row-level security|permission denied/i.test(error.message)) {
    return FORBIDDEN;
  }
  // The guards' own messages (migration 0025) are written for the reader.
  return error.message;
}

/** Resolve a patient's clinic and check the clinic type + permission. */
async function scopeForPatient(
  patientId: string,
  permission: Permission,
): Promise<{ error: string } | { clinicId: string }> {
  const auth = await getAuthContext();
  const organizationId = auth?.memberships[0]?.organizationId;
  if (!organizationId) return { error: "You're not signed in." };

  const supabase = await getSupabaseServerClient();
  // RLS-filtered: a patient the caller cannot see is simply not found.
  const { data: patient } = await supabase
    .from("patients")
    .select("clinic_id")
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) return { error: "Patient not found." };

  const ctx = await getClinicDentalContext(patient.clinic_id);
  if (!ctx?.isDental) return { error: NOT_DENTAL };

  if (!(await can(permission, { organizationId, clinicId: patient.clinic_id }))) {
    return { error: FORBIDDEN };
  }
  return { clinicId: patient.clinic_id };
}

/** Resolve a treatment's or condition's patient, then scope as above. */
async function scopeForRecord(
  table: "dental_treatments" | "dental_conditions",
  id: string,
  permission: Permission,
): Promise<{ error: string } | { patientId: string }> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from(table).select("patient_id").eq("id", id).maybeSingle();
  if (!data) return { error: "Record not found." };
  const scope = await scopeForPatient(data.patient_id, permission);
  return "error" in scope ? scope : { patientId: data.patient_id };
}

function refresh(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
}

export async function recordConditionsAction(
  patientId: string,
  input: RecordConditionsInput,
): Promise<Result> {
  const parsed = recordConditionsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const scope = await scopeForPatient(patientId, "dental.record");
  if ("error" in scope) return scope;

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("dental_record_conditions", {
    p_patient_id: patientId,
    p_tooth_codes: parsed.data.toothCodes,
    p_condition: parsed.data.condition,
    p_surfaces: parsed.data.surfaces,
    p_notes: parsed.data.notes,
  });
  if (error) return { error: explain(error) };

  refresh(patientId);
  return {};
}

export async function setConditionStatusAction(
  conditionId: string,
  input: ConditionStatusInput,
): Promise<Result> {
  const parsed = conditionStatusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const scope = await scopeForRecord("dental_conditions", conditionId, "dental.record");
  if ("error" in scope) return scope;

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("dental_set_condition_status", {
    p_condition_id: conditionId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: explain(error) };

  refresh(scope.patientId);
  return {};
}

export async function planTreatmentAction(
  patientId: string,
  input: PlanTreatmentInput,
): Promise<Result> {
  const parsed = planTreatmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  // Recording a performed procedure is a sign-off, so it needs dental.complete
  // on top of dental.record.
  const scope = await scopeForPatient(patientId, "dental.record");
  if ("error" in scope) return scope;
  if (parsed.data.completeNow) {
    const signOff = await scopeForPatient(patientId, "dental.complete");
    if ("error" in signOff) {
      return {
        error:
          signOff.error === FORBIDDEN
            ? "Recording a performed procedure needs sign-off permission. Plan it instead."
            : signOff.error,
      };
    }
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("dental_plan_treatment", {
    p_patient_id: patientId,
    p_procedure: parsed.data.procedure ?? "",
    p_teeth: parsed.data.teeth.map((t) => ({ tooth_code: t.toothCode, surfaces: t.surfaces })),
    p_service_id: parsed.data.serviceId,
    p_appointment_id: parsed.data.appointmentId,
    p_practitioner_id: parsed.data.practitionerId,
    p_resulting_condition: parsed.data.resultingCondition,
    p_notes: parsed.data.notes,
    p_complete_now: parsed.data.completeNow,
  });
  if (error) return { error: explain(error) };

  refresh(patientId);
  return {};
}

/** Link a planned treatment to an appointment, or unlink it with null. */
export async function scheduleTreatmentAction(
  treatmentId: string,
  appointmentId: string | null,
): Promise<Result> {
  const scope = await scopeForRecord("dental_treatments", treatmentId, "dental.record");
  if ("error" in scope) return scope;

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("dental_schedule_treatment", {
    p_treatment_id: treatmentId,
    // The RPC's parameter is nullable; the generated type says string because
    // Postgres function arguments carry no nullability.
    p_appointment_id: appointmentId as string,
  });
  if (error) return { error: explain(error) };

  refresh(scope.patientId);
  return {};
}

export async function completeTreatmentAction(
  treatmentId: string,
  notes?: string,
): Promise<Result> {
  const scope = await scopeForRecord("dental_treatments", treatmentId, "dental.complete");
  if ("error" in scope) return scope;

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("dental_complete_treatment", {
    p_treatment_id: treatmentId,
    p_notes: notes?.trim() || undefined,
  });
  if (error) return { error: explain(error) };

  refresh(scope.patientId);
  return {};
}

export async function closeTreatmentAction(
  treatmentId: string,
  input: CloseTreatmentInput,
): Promise<Result> {
  const parsed = closeTreatmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const scope = await scopeForRecord("dental_treatments", treatmentId, "dental.record");
  if ("error" in scope) return scope;

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("dental_close_treatment", {
    p_treatment_id: treatmentId,
    p_reason: parsed.data.reason ?? "",
    p_entered_in_error: parsed.data.enteredInError,
  });
  if (error) return { error: explain(error) };

  refresh(scope.patientId);
  return {};
}
