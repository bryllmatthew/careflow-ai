import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { clinicHasCapability, type ToothNumbering } from "@/lib/clinic-types";
import { isDentalSurface, type DentalSurface } from "./vocabulary";
import type { Tooth } from "./teeth";
import type { ConditionRecord, TreatmentRecord } from "./chart";

/**
 * Reads for the dental module. Every query runs through the normal
 * RLS-respecting client, so the three-part dental policy (dental.view AND a
 * dental-capable clinic AND a patient the caller can see -- migration 0025)
 * decides what comes back. Nothing here re-implements those rules; a caller
 * without access gets empty arrays, not an error.
 */

export type DentalClinicContext = {
  clinicId: string;
  clinicType: string;
  toothNumbering: ToothNumbering;
  /** The clinic's type has the dental module. Says nothing about the user's permissions. */
  isDental: boolean;
};

export async function getClinicDentalContext(
  clinicId: string,
): Promise<DentalClinicContext | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("clinics")
    .select("id, clinic_type, tooth_numbering")
    .eq("id", clinicId)
    .maybeSingle();
  if (!data) return null;
  return {
    clinicId: data.id,
    clinicType: data.clinic_type,
    toothNumbering: data.tooth_numbering === "universal" ? "universal" : "fdi",
    isDental: clinicHasCapability(data.clinic_type, "dental"),
  };
}

/** The static tooth reference (32 permanent teeth). */
export async function listTeeth(): Promise<Tooth[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("dental_teeth")
    .select("code, arch, side, position, tooth_class, name, universal")
    .eq("dentition", "permanent")
    .order("code");
  return (data ?? []).map((t) => ({
    code: t.code,
    arch: t.arch as Tooth["arch"],
    side: t.side as Tooth["side"],
    position: t.position,
    toothClass: t.tooth_class as Tooth["toothClass"],
    name: t.name,
    universal: t.universal,
  }));
}

type Person = { full_name: string | null; email: string | null } | null;
const personName = (p: Person) => p?.full_name ?? p?.email ?? null;
const toSurfaces = (value: unknown): DentalSurface[] =>
  Array.isArray(value) ? value.filter(isDentalSurface) : [];

export async function getPatientDentalRecord(patientId: string): Promise<{
  conditions: ConditionRecord[];
  treatments: TreatmentRecord[];
}> {
  const supabase = await getSupabaseServerClient();

  const [conditionsRes, treatmentsRes] = await Promise.all([
    supabase
      .from("dental_conditions")
      .select(
        "id, tooth_code, surfaces, condition, status, notes, status_reason, source_treatment_id, " +
          "noted_at, closed_at, " +
          "noted:profiles!dental_conditions_noted_by_fkey(full_name, email), " +
          "closer:profiles!dental_conditions_closed_by_fkey(full_name, email)",
      )
      .eq("patient_id", patientId)
      .order("noted_at", { ascending: false }),
    supabase
      .from("dental_treatments")
      .select(
        "id, procedure, status, resulting_condition, notes, status_reason, appointment_id, " +
          "planned_at, completed_at, closed_at, " +
          "dental_treatment_teeth(tooth_code, surfaces), " +
          "service:services!dental_treatments_service_fk(name), " +
          "appointment:appointments!dental_treatments_appointment_fk(start_at), " +
          "practitioner:profiles!dental_treatments_practitioner_id_fkey(full_name, email), " +
          "planner:profiles!dental_treatments_planned_by_fkey(full_name, email), " +
          "completer:profiles!dental_treatments_completed_by_fkey(full_name, email), " +
          "closer:profiles!dental_treatments_closed_by_fkey(full_name, email)",
      )
      .eq("patient_id", patientId)
      .order("planned_at", { ascending: false }),
  ]);

  type RawCondition = {
    id: string;
    tooth_code: number;
    surfaces: unknown;
    condition: string;
    status: ConditionRecord["status"];
    notes: string | null;
    status_reason: string | null;
    source_treatment_id: string | null;
    noted_at: string;
    closed_at: string | null;
    noted: Person;
    closer: Person;
  };

  type RawTreatment = {
    id: string;
    procedure: string;
    status: TreatmentRecord["status"];
    resulting_condition: string | null;
    notes: string | null;
    status_reason: string | null;
    appointment_id: string | null;
    planned_at: string;
    completed_at: string | null;
    closed_at: string | null;
    dental_treatment_teeth: { tooth_code: number; surfaces: unknown }[] | null;
    service: { name: string } | null;
    appointment: { start_at: string } | null;
    practitioner: Person;
    planner: Person;
    completer: Person;
    closer: Person;
  };

  const conditions = ((conditionsRes.data ?? []) as unknown as RawCondition[]).map(
    (c): ConditionRecord => ({
      id: c.id,
      toothCode: c.tooth_code,
      surfaces: toSurfaces(c.surfaces),
      condition: c.condition,
      status: c.status,
      notes: c.notes,
      statusReason: c.status_reason,
      sourceTreatmentId: c.source_treatment_id,
      notedAt: c.noted_at,
      notedBy: personName(c.noted),
      closedAt: c.closed_at,
      closedBy: personName(c.closer),
    }),
  );

  const treatments = ((treatmentsRes.data ?? []) as unknown as RawTreatment[]).map(
    (t): TreatmentRecord => ({
      id: t.id,
      procedure: t.procedure,
      status: t.status,
      resultingCondition: t.resulting_condition,
      notes: t.notes,
      statusReason: t.status_reason,
      teeth: (t.dental_treatment_teeth ?? [])
        .map((x) => ({ toothCode: x.tooth_code, surfaces: toSurfaces(x.surfaces) }))
        .sort((a, b) => a.toothCode - b.toothCode),
      appointmentId: t.appointment_id,
      appointmentStartAt: t.appointment?.start_at ?? null,
      serviceName: t.service?.name ?? null,
      practitionerName: personName(t.practitioner),
      plannedAt: t.planned_at,
      plannedBy: personName(t.planner),
      completedAt: t.completed_at,
      completedBy: personName(t.completer),
      closedAt: t.closed_at,
      closedBy: personName(t.closer),
    }),
  );

  return { conditions, treatments };
}
