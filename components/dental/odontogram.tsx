"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { ToothNumbering } from "@/lib/clinic-types";
import {
  UPPER_ROW,
  LOWER_ROW,
  displayToothNumber,
  zoneForSurface,
  isAnterior,
  type Tooth,
  type SurfaceZone,
} from "@/lib/dental/teeth";
import type { ToothState } from "@/lib/dental/chart";
import { conditionMeta, TONE_SVG } from "@/lib/dental/vocabulary";

/**
 * An interactive odontogram for the permanent dentition.
 *
 * Drawn the way a dental chart is conventionally drawn -- facing the patient,
 * so the patient's right is on the viewer's left -- with each tooth shown as
 * a crown-and-root silhouette (root count by tooth type) above the classic
 * five-part surface diagram. Findings paint where they belong: surface
 * findings on their surfaces, crowns on the crown, root canals and implants
 * on the root, missing and extracted teeth ghosted and crossed out.
 *
 * Pure presentation: it knows nothing about records or permissions. It is
 * handed the state of each tooth and reports which tooth was clicked.
 */

const COL = 46;
const MIDLINE_GAP = 14;
const PAD_X = 14;
const WIDTH = PAD_X * 2 + 16 * COL + MIDLINE_GAP;
const HEIGHT = 284;

// Vertical landmarks. The two arches meet at the occlusal plane in the middle.
const UPPER_LABEL_Y = 16;
const UPPER_OCCLUSAL_Y = 96; // bottom edge of the upper crowns
const UPPER_SURFACE_Y = 104; // top of the upper surface diagrams
const LOWER_SURFACE_Y = 154;
const LOWER_OCCLUSAL_Y = 188; // top edge of the lower crowns
const LOWER_LABEL_Y = 274;
const OCCLUSAL_PLANE_Y = 142;

const CROWN_H = 24;
const SURFACE = 26;
const SURFACE_INNER = 10;

function columnX(index: number) {
  return PAD_X + index * COL + COL / 2 + (index >= 8 ? MIDLINE_GAP : 0);
}

function crownWidth(tooth: Tooth) {
  switch (tooth.toothClass) {
    case "incisor":
      return tooth.position === 1 ? 24 : 20;
    case "canine":
      return 22;
    case "premolar":
      return 26;
    case "molar":
      return 34;
  }
}

/** A tapered, slightly curved root from the cervical line to its apex. */
function rootPath(x: number, cervicalY: number, width: number, length: number, dir: 1 | -1) {
  const apexY = cervicalY + dir * length;
  const half = width / 2;
  const bend = cervicalY + dir * length * 0.55;
  return (
    `M ${x - half} ${cervicalY} ` +
    `C ${x - half} ${bend}, ${x - half * 0.35} ${apexY}, ${x} ${apexY} ` +
    `C ${x + half * 0.35} ${apexY}, ${x + half} ${bend}, ${x + half} ${cervicalY} Z`
  );
}

/** Root silhouettes by tooth type: one for anterior teeth and premolars, two or three for molars. */
function rootPaths(tooth: Tooth, x: number, cervicalY: number, w: number, dir: 1 | -1) {
  if (tooth.toothClass === "molar") {
    if (tooth.arch === "upper") {
      return [
        rootPath(x - w * 0.26, cervicalY, w * 0.3, 32, dir),
        rootPath(x, cervicalY, w * 0.32, 38, dir),
        rootPath(x + w * 0.26, cervicalY, w * 0.3, 32, dir),
      ];
    }
    return [
      rootPath(x - w * 0.24, cervicalY, w * 0.36, 36, dir),
      rootPath(x + w * 0.24, cervicalY, w * 0.36, 36, dir),
    ];
  }
  const length = tooth.toothClass === "canine" ? 46 : tooth.toothClass === "incisor" ? 38 : 38;
  return [rootPath(x, cervicalY, w * 0.6, length, dir)];
}

type ZoneFill = Partial<Record<SurfaceZone, { fill: string; stroke: string }>>;

function toothPaint(tooth: Tooth, state: ToothState | undefined) {
  const paint = {
    absent: false,
    crown: null as { fill: string; stroke: string } | null,
    crownDashed: false,
    root: null as { fill: string; stroke: string } | null,
    zones: {} as ZoneFill,
    cross: null as string | null,
    observe: null as string | null,
  };
  if (!state) return paint;

  // Lowest priority first, so the most significant finding paints last.
  for (const c of [...state.present].reverse()) {
    const meta = conditionMeta(c.condition);
    const tone = TONE_SVG[meta.tone];
    switch (meta.render) {
      case "absent":
        paint.absent = true;
        break;
      case "surface":
        if (c.surfaces.length === 0) paint.crown = tone;
        for (const s of c.surfaces) paint.zones[zoneForSurface(tooth, s)] = tone;
        break;
      case "crown":
        paint.crown = tone;
        if (c.condition === "impacted") paint.crownDashed = true;
        break;
      case "root":
        paint.root = tone;
        break;
      case "marker":
        if (c.condition === "for_extraction") paint.cross = tone.stroke;
        else paint.observe = tone.stroke;
        break;
    }
  }
  return paint;
}

function zonePolygons(x: number, top: number) {
  const o = { x0: x - SURFACE / 2, x1: x + SURFACE / 2, y0: top, y1: top + SURFACE };
  const i = {
    x0: x - SURFACE_INNER / 2,
    x1: x + SURFACE_INNER / 2,
    y0: top + (SURFACE - SURFACE_INNER) / 2,
    y1: top + (SURFACE + SURFACE_INNER) / 2,
  };
  const pts = (...p: [number, number][]) => p.map(([a, b]) => `${a},${b}`).join(" ");
  return {
    top: pts([o.x0, o.y0], [o.x1, o.y0], [i.x1, i.y0], [i.x0, i.y0]),
    right: pts([o.x1, o.y0], [o.x1, o.y1], [i.x1, i.y1], [i.x1, i.y0]),
    bottom: pts([o.x1, o.y1], [o.x0, o.y1], [i.x0, i.y1], [i.x1, i.y1]),
    left: pts([o.x0, o.y1], [o.x0, o.y0], [i.x0, i.y0], [i.x0, i.y1]),
    center: pts([i.x0, i.y0], [i.x1, i.y0], [i.x1, i.y1], [i.x0, i.y1]),
  } satisfies Record<SurfaceZone, string>;
}

const BASE_FILL = "var(--card)";
const BASE_STROKE = "color-mix(in oklch, var(--muted-foreground) 55%, transparent)";
const ROOT_FILL = "var(--muted)";

function ToothGlyph({
  tooth,
  index,
  numbering,
  state,
  selected,
  onToggle,
}: {
  tooth: Tooth;
  index: number;
  numbering: ToothNumbering;
  state: ToothState | undefined;
  selected: boolean;
  onToggle: (code: number) => void;
}) {
  const x = columnX(index);
  const upper = tooth.arch === "upper";
  const dir: 1 | -1 = upper ? -1 : 1;
  const w = crownWidth(tooth);
  const occlusalY = upper ? UPPER_OCCLUSAL_Y : LOWER_OCCLUSAL_Y;
  const crownTop = upper ? occlusalY - CROWN_H : occlusalY;
  const cervicalY = upper ? crownTop : occlusalY + CROWN_H;
  const surfaceTop = upper ? UPPER_SURFACE_Y : LOWER_SURFACE_Y;
  const labelY = upper ? UPPER_LABEL_Y : LOWER_LABEL_Y;
  const regionTop = upper ? 2 : LOWER_SURFACE_Y - 8;
  const regionBottom = upper ? UPPER_SURFACE_Y + SURFACE + 8 : HEIGHT - 2;

  const paint = toothPaint(tooth, state);
  const zones = zonePolygons(x, surfaceTop);
  const planned = (state?.open.length ?? 0) > 0;
  const number = displayToothNumber(tooth, numbering);

  const findings = state?.present.map((c) => conditionMeta(c.condition).label) ?? [];
  const label =
    `Tooth ${number}, ${tooth.name}. ` +
    (findings.length ? `Findings: ${findings.join(", ")}.` : "No findings.") +
    (planned ? " Treatment planned." : "");

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle(tooth.code);
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onToggle(tooth.code)}
      onKeyDown={onKeyDown}
      className="group cursor-pointer outline-none"
    >
      <title>{label}</title>

      {/* Hit area, hover wash, selection and keyboard-focus ring in one rect. */}
      <rect
        x={x - COL / 2 + 2}
        y={regionTop}
        width={COL - 4}
        height={regionBottom - regionTop}
        rx={10}
        fill={selected ? "var(--tint-primary)" : "transparent"}
        stroke={selected ? "var(--primary)" : "transparent"}
        strokeWidth={1.5}
        className={cn(
          "transition-colors",
          !selected && "group-hover:fill-[var(--muted)]",
          "group-focus-visible:stroke-[var(--ring)]",
        )}
      />

      <g opacity={paint.absent ? 0.28 : 1}>
        {rootPaths(tooth, x, cervicalY, w, dir).map((d, i) => (
          <path
            key={i}
            d={d}
            fill={paint.root?.fill ?? ROOT_FILL}
            stroke={paint.root?.stroke ?? BASE_STROKE}
            strokeWidth={1}
          />
        ))}
        <rect
          x={x - w / 2}
          y={crownTop}
          width={w}
          height={CROWN_H}
          rx={isAnterior(tooth) ? 7 : 6}
          fill={paint.crown?.fill ?? BASE_FILL}
          stroke={paint.crown?.stroke ?? BASE_STROKE}
          strokeWidth={paint.crown ? 1.4 : 1}
          strokeDasharray={paint.crownDashed ? "3 2" : undefined}
        />
      </g>

      {paint.absent && (
        <path
          d={`M ${x - w / 2 - 2} ${crownTop - 2} L ${x + w / 2 + 2} ${crownTop + CROWN_H + 2} M ${x + w / 2 + 2} ${crownTop - 2} L ${x - w / 2 - 2} ${crownTop + CROWN_H + 2}`}
          stroke="var(--muted-foreground)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
      {paint.cross && (
        <path
          d={`M ${x - 7} ${crownTop + 5} L ${x + 7} ${crownTop + CROWN_H - 5} M ${x + 7} ${crownTop + 5} L ${x - 7} ${crownTop + CROWN_H - 5}`}
          stroke={paint.cross}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      {paint.observe && (
        <circle
          cx={x + w / 2 - 1}
          cy={upper ? crownTop + 3 : crownTop + CROWN_H - 3}
          r={3.4}
          fill={paint.observe}
        />
      )}

      {(Object.keys(zones) as SurfaceZone[]).map((zone) => (
        <polygon
          key={zone}
          points={zones[zone]}
          fill={paint.zones[zone]?.fill ?? BASE_FILL}
          stroke={paint.zones[zone]?.stroke ?? BASE_STROKE}
          strokeWidth={paint.zones[zone] ? 1.2 : 0.8}
          opacity={paint.absent ? 0.35 : 1}
        />
      ))}

      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        className={cn(
          "text-[11px] tabular-nums select-none",
          selected ? "fill-primary font-semibold" : "fill-muted-foreground",
        )}
      >
        {number}
      </text>
      {planned && <circle cx={x + 11} cy={labelY - 4} r={3} fill="var(--primary)" aria-hidden />}
    </g>
  );
}

export function Odontogram({
  teeth,
  numbering,
  states,
  selected,
  onToggle,
}: {
  teeth: Tooth[];
  numbering: ToothNumbering;
  states: Map<number, ToothState>;
  selected: ReadonlySet<number>;
  onToggle: (code: number) => void;
}) {
  const byCode = new Map(teeth.map((t) => [t.code, t]));
  const midlineX = PAD_X + 8 * COL + MIDLINE_GAP / 2;

  const row = (codes: readonly number[]) =>
    codes.map((code, index) => {
      const tooth = byCode.get(code);
      if (!tooth) return null;
      return (
        <ToothGlyph
          key={code}
          tooth={tooth}
          index={index}
          numbering={numbering}
          state={states.get(code)}
          selected={selected.has(code)}
          onToggle={onToggle}
        />
      );
    });

  return (
    // Scrolls sideways inside its own container on narrow screens rather than
    // shrinking 32 teeth into targets too small to tap.
    <div className="-mx-1 overflow-x-auto px-1">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mx-auto block w-full min-w-[640px]"
        role="group"
        aria-label="Dental chart. Upper arch on top, lower arch below; the patient's right is on the left."
      >
        {/* Occlusal plane and midline guides. */}
        <line
          x1={PAD_X}
          x2={WIDTH - PAD_X}
          y1={OCCLUSAL_PLANE_Y}
          y2={OCCLUSAL_PLANE_Y}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        <line
          x1={midlineX}
          x2={midlineX}
          y1={6}
          y2={HEIGHT - 6}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        <text
          x={PAD_X}
          y={OCCLUSAL_PLANE_Y - 5}
          className="fill-muted-foreground text-[10px] font-medium"
        >
          R
        </text>
        <text
          x={WIDTH - PAD_X}
          y={OCCLUSAL_PLANE_Y - 5}
          textAnchor="end"
          className="fill-muted-foreground text-[10px] font-medium"
        >
          L
        </text>

        {row(UPPER_ROW)}
        {row(LOWER_ROW)}
      </svg>
    </div>
  );
}
