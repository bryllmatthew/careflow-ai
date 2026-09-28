/**
 * Clinic types and the capabilities each one unlocks -- the single
 * application-side answer to "does this clinic get this feature?".
 *
 * Components never branch on a clinic type directly (`type === "dental"`).
 * They ask `clinicHasCapability(type, "dental")`, so adding a specialty module
 * later is one entry in CAPABILITIES rather than a hunt through every screen.
 *
 * The database has the mirror of this map, app.clinic_type_has_capability
 * (migration 0024), and that one is authoritative: every specialty table's RLS
 * policy calls it. If the two ever disagree the failure is closed -- the UI
 * would offer a tab whose data the database then refuses -- never open.
 */

export const CLINIC_TYPES = [
  "dental",
  "medical",
  "aesthetic",
  "therapy",
  "wellness",
  "other",
] as const;

export type ClinicType = (typeof CLINIC_TYPES)[number];

export const CLINIC_TYPE_LABELS: Record<ClinicType, string> = {
  dental: "Dental Clinic",
  medical: "Medical Clinic",
  aesthetic: "Aesthetic Clinic",
  therapy: "Therapy / Rehabilitation Clinic",
  wellness: "Wellness Clinic",
  other: "Other",
};

/**
 * A capability is a whole specialty module, not a sub-feature flag: nothing
 * in the product enables a dental chart without dental history, and a switch
 * per sub-feature would be configuration nobody sets. Future modules
 * ("aesthetic", "therapy", "medical") join this union when they are built.
 */
export type ClinicCapability = "dental";

const CAPABILITIES: Record<ClinicType, readonly ClinicCapability[]> = {
  dental: ["dental"],
  medical: [],
  aesthetic: [],
  therapy: [],
  wellness: [],
  other: [],
};

export function isClinicType(value: unknown): value is ClinicType {
  return typeof value === "string" && (CLINIC_TYPES as readonly string[]).includes(value);
}

/** Unknown or missing types have no capabilities -- fail closed. */
export function clinicHasCapability(
  type: string | null | undefined,
  capability: ClinicCapability,
): boolean {
  return isClinicType(type) && CAPABILITIES[type].includes(capability);
}

export const TOOTH_NUMBERING_SYSTEMS = ["fdi", "universal"] as const;
export type ToothNumbering = (typeof TOOTH_NUMBERING_SYSTEMS)[number];

export const TOOTH_NUMBERING_LABELS: Record<ToothNumbering, string> = {
  fdi: "FDI / ISO 3950 (11–48)",
  universal: "Universal (1–32)",
};
