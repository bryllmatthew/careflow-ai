/**
 * The dental module's vocabulary: condition codes, surfaces, treatment
 * statuses, and how each renders.
 *
 * Mirrors the public.dental_condition_code and public.dental_surface_set
 * domains (migration 0025). Adding a condition is one line there and one entry
 * here -- and until the entry exists, conditionMeta() renders the raw code
 * rather than breaking, so a database that is ahead of the UI still displays.
 *
 * Client-safe: no server imports. The odontogram and the history view both
 * read it.
 */

export const DENTAL_CONDITIONS = [
  "caries",
  "restoration",
  "crown",
  "bridge",
  "implant",
  "root_canal_treated",
  "missing",
  "extracted",
  "impacted",
  "for_extraction",
  "under_observation",
  "other",
] as const;

export type DentalCondition = (typeof DENTAL_CONDITIONS)[number];

/** The app's tint tokens (app/globals.css) -- theme-aware, usable as SVG fills. */
export type DentalTone = "destructive" | "warning" | "info" | "primary" | "success" | "muted";

export type ConditionMeta = {
  label: string;
  tone: DentalTone;
  /**
   * Where it draws on the odontogram: on the surfaces charted (falling back to
   * the crown when none were), on the root, or as an absent tooth.
   */
  render: "surface" | "crown" | "root" | "absent" | "marker";
  /** Higher wins when two findings share a surface. */
  priority: number;
};

const META: Record<DentalCondition, ConditionMeta> = {
  caries: { label: "Caries", tone: "destructive", render: "surface", priority: 90 },
  restoration: { label: "Filling / Restoration", tone: "info", render: "surface", priority: 60 },
  crown: { label: "Crown", tone: "primary", render: "crown", priority: 70 },
  bridge: { label: "Bridge", tone: "primary", render: "crown", priority: 70 },
  implant: { label: "Implant", tone: "primary", render: "root", priority: 75 },
  root_canal_treated: { label: "Root Canal Treated", tone: "info", render: "root", priority: 65 },
  missing: { label: "Missing", tone: "muted", render: "absent", priority: 100 },
  extracted: { label: "Extracted", tone: "muted", render: "absent", priority: 100 },
  impacted: { label: "Impacted", tone: "warning", render: "crown", priority: 50 },
  for_extraction: { label: "For Extraction", tone: "destructive", render: "marker", priority: 85 },
  under_observation: {
    label: "Under Observation",
    tone: "warning",
    render: "marker",
    priority: 40,
  },
  other: { label: "Other", tone: "muted", render: "crown", priority: 10 },
};

export function isDentalCondition(value: unknown): value is DentalCondition {
  return typeof value === "string" && (DENTAL_CONDITIONS as readonly string[]).includes(value);
}

export function conditionMeta(code: string): ConditionMeta {
  return isDentalCondition(code)
    ? META[code]
    : { label: code.replace(/_/g, " "), tone: "muted", render: "crown", priority: 0 };
}

export const DENTAL_SURFACES = [
  "mesial",
  "distal",
  "buccal",
  "lingual",
  "occlusal",
  "incisal",
] as const;

export type DentalSurface = (typeof DENTAL_SURFACES)[number];

export const SURFACE_LABELS: Record<DentalSurface, string> = {
  mesial: "Mesial",
  distal: "Distal",
  buccal: "Buccal / Facial",
  lingual: "Lingual / Palatal",
  occlusal: "Occlusal",
  incisal: "Incisal",
};

/** Single-letter abbreviations used on compact chips (M, D, B, L, O, I). */
export const SURFACE_ABBREVIATIONS: Record<DentalSurface, string> = {
  mesial: "M",
  distal: "D",
  buccal: "B",
  lingual: "L",
  occlusal: "O",
  incisal: "I",
};

export function isDentalSurface(value: unknown): value is DentalSurface {
  return typeof value === "string" && (DENTAL_SURFACES as readonly string[]).includes(value);
}

export const TREATMENT_STATUSES = [
  "planned",
  "scheduled",
  "completed",
  "cancelled",
  "entered_in_error",
] as const;

export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];

export const TREATMENT_STATUS_META: Record<TreatmentStatus, { label: string; tone: DentalTone }> = {
  planned: { label: "Planned", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "muted" },
  entered_in_error: { label: "Entered in error", tone: "muted" },
};

export function treatmentStatusMeta(status: string) {
  return (
    (TREATMENT_STATUS_META as Record<string, { label: string; tone: DentalTone }>)[status] ?? {
      label: status,
      tone: "muted" as DentalTone,
    }
  );
}

/** Tailwind classes for a tinted chip in a given tone. */
export const TONE_CHIP: Record<DentalTone, string> = {
  destructive: "bg-tint-destructive text-tint-destructive-foreground",
  warning: "bg-tint-warning text-tint-warning-foreground",
  info: "bg-tint-info text-tint-info-foreground",
  primary: "bg-tint-primary text-tint-primary-foreground",
  success: "bg-tint-success text-tint-success-foreground",
  muted: "bg-muted text-muted-foreground",
};

/**
 * SVG fill/stroke for a tone on the odontogram.
 *
 * Deliberately NOT the pale --tint-* chip backgrounds: those are tuned for a
 * label on a badge, and on a small tooth surface they are close to invisible
 * -- a charted caries has to be unmissable at a glance. The fill mixes each
 * tone's saturated foreground colour into the card surface, so it stays
 * strong but still follows the light/dark theme.
 */
const svgTone = (ink: string) => ({
  fill: `color-mix(in oklch, var(${ink}) 55%, var(--card))`,
  stroke: `var(${ink})`,
});

export const TONE_SVG: Record<DentalTone, { fill: string; stroke: string }> = {
  destructive: svgTone("--tint-destructive-foreground"),
  warning: svgTone("--tint-warning-foreground"),
  info: svgTone("--tint-info-foreground"),
  primary: svgTone("--tint-primary-foreground"),
  success: svgTone("--tint-success-foreground"),
  muted: {
    fill: "color-mix(in oklch, var(--muted-foreground) 30%, var(--card))",
    stroke: "var(--muted-foreground)",
  },
};
