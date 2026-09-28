import type { ToothNumbering } from "@/lib/clinic-types";
import type { DentalSurface } from "./vocabulary";

/**
 * One tooth, as stored in public.dental_teeth (migration 0025). `code` is the
 * ISO 3950 designation and the only thing records reference; everything a
 * user sees -- the displayed number, the name -- is derived from this row.
 *
 * Client-safe.
 */
export type Tooth = {
  code: number;
  arch: "upper" | "lower";
  /** The PATIENT's side, per dental convention. */
  side: "right" | "left";
  position: number;
  toothClass: "incisor" | "canine" | "premolar" | "molar";
  name: string;
  universal: string;
};

/**
 * Chart order, viewer's left to right, for a chart drawn facing the patient:
 * the patient's right (quadrants 1 and 4) appears on the viewer's left.
 */
export const UPPER_ROW = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as const;
export const LOWER_ROW = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] as const;

/** The number a clinic sees, per its tooth-numbering preference. */
export function displayToothNumber(
  tooth: Pick<Tooth, "code" | "universal">,
  numbering: ToothNumbering,
) {
  return numbering === "universal" ? tooth.universal : String(tooth.code);
}

export function isAnterior(tooth: Pick<Tooth, "toothClass">) {
  return tooth.toothClass === "incisor" || tooth.toothClass === "canine";
}

/**
 * The surfaces a clinician charts on this tooth: anterior teeth have an
 * incisal edge, posterior teeth an occlusal surface. The database accepts
 * either on any tooth (migration 0025 explains why); the UI offers the right
 * one so it is the natural choice.
 */
export function surfacesFor(tooth: Pick<Tooth, "toothClass">): DentalSurface[] {
  return ["mesial", "distal", "buccal", "lingual", isAnterior(tooth) ? "incisal" : "occlusal"];
}

/**
 * Which side of the chart's 5-part surface diagram a surface occupies, for a
 * given tooth.
 *
 *  - The side facing the middle of the chart (between the arches) is lingual;
 *    the side facing the outer edge is buccal. For the upper arch that is
 *    bottom/top; for the lower arch, top/bottom.
 *  - Mesial faces the midline: the right edge for teeth on the viewer's left
 *    (the patient's right) and the left edge for teeth on the viewer's right.
 */
export type SurfaceZone = "top" | "bottom" | "left" | "right" | "center";

export function zoneForSurface(
  tooth: Pick<Tooth, "arch" | "side">,
  surface: DentalSurface,
): SurfaceZone {
  switch (surface) {
    case "occlusal":
    case "incisal":
      return "center";
    case "buccal":
      return tooth.arch === "upper" ? "top" : "bottom";
    case "lingual":
      return tooth.arch === "upper" ? "bottom" : "top";
    case "mesial":
      return tooth.side === "right" ? "right" : "left";
    case "distal":
      return tooth.side === "right" ? "left" : "right";
  }
}
