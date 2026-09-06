"use client";

import { useId, useState } from "react";

export type TrendSeries = {
  key: string;
  label: string;
  /** One of the app's validated categorical chart tokens -- var(--chart-1) etc (see app/globals.css). Never a raw hex chosen ad hoc. */
  colorVar: "--chart-1" | "--chart-2" | "--chart-3" | "--chart-4" | "--chart-5";
};

export type TrendChartProps = {
  data: Record<string, number | string>[];
  series: TrendSeries[];
  /**
   * How to format a raw series value for the tooltip/axis -- a serializable
   * description, NOT a function: this component is a Client Component, and
   * a Server Component caller (every dashboard/report page) cannot pass a
   * plain callback across that boundary ("Functions cannot be passed
   * directly to Client Components"). `currency` is required when
   * `style: "currency"`.
   */
  valueFormat?: { style: "number" } | { style: "currency"; currency: string };
  height?: number;
};

/**
 * A single reusable line-trend chart (dataviz skill: 2px lines, round
 * joins, ~10% area wash, hairline gridlines, one legend only for >= 2
 * series, hover crosshair + one tooltip listing every series at that X).
 * No external chart library -- two simple trends don't justify one, and
 * this stays on the app's own validated `--chart-N` tokens (see
 * app/globals.css) rather than introducing a second palette.
 */
export function TrendChart({
  data,
  series,
  valueFormat = { style: "number" },
  height = 220,
}: TrendChartProps) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const formatValue = (value: number): string =>
    valueFormat.style === "currency"
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: valueFormat.currency,
        }).format(value)
      : value.toLocaleString();

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        No data for this period
      </div>
    );
  }

  const width = 720;
  const padding = { top: 16, right: 12, bottom: 24, left: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0));
  const rawMax = Math.max(1, ...allValues);
  // Round the axis ceiling to a clean step (dataviz skill: "round to clean numbers").
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const maxValue = Math.ceil(rawMax / magnitude) * magnitude;

  const x = (i: number) =>
    padding.left + (data.length === 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);
  const y = (v: number) => padding.top + plotHeight - (v / maxValue) * plotHeight;

  const linePath = (key: string) =>
    data
      .map(
        (row, i) =>
          `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(Number(row[key]) || 0).toFixed(1)}`,
      )
      .join(" ");

  const areaPath = (key: string) => {
    const line = data.map((row, i) => `${x(i).toFixed(1)},${y(Number(row[key]) || 0).toFixed(1)}`);
    return `M ${line[0]} L ${line.join(" L ")} L ${x(data.length - 1).toFixed(1)},${y(0).toFixed(1)} L ${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => padding.top + plotHeight * (1 - f));

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: `var(${s.colorVar})` }}
                aria-hidden
              />
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Trend chart: ${series.map((s) => s.label).join(", ")}`}
        preserveAspectRatio="none"
        style={{ height }}
      >
        {gridLines.map((gy, i) => (
          <line
            key={i}
            x1={padding.left}
            x2={width - padding.right}
            y1={gy}
            y2={gy}
            className="stroke-border"
            strokeWidth={1}
          />
        ))}

        {series.map((s) => (
          <defs key={s.key}>
            <linearGradient id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(${s.colorVar})`} stopOpacity={0.12} />
              <stop offset="100%" stopColor={`var(${s.colorVar})`} stopOpacity={0} />
            </linearGradient>
          </defs>
        ))}

        {series.length === 1 &&
          series.map((s) => (
            <path key={s.key} d={areaPath(s.key)} fill={`url(#${gradientId}-${s.key})`} />
          ))}

        {series.map((s) => (
          <path
            key={s.key}
            d={linePath(s.key)}
            fill="none"
            stroke={`var(${s.colorVar})`}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hoverIndex !== null && (
          <line
            x1={x(hoverIndex)}
            x2={x(hoverIndex)}
            y1={padding.top}
            y2={padding.top + plotHeight}
            className="stroke-muted-foreground"
            strokeWidth={1}
          />
        )}

        {series.map((s) =>
          data.map((row, i) => (
            <circle
              key={`${s.key}-${i}`}
              cx={x(i)}
              cy={y(Number(row[s.key]) || 0)}
              r={hoverIndex === i ? 4 : 0}
              fill={`var(${s.colorVar})`}
              stroke="var(--card)"
              strokeWidth={2}
            />
          )),
        )}

        {/* Hit targets -- one per data point, wider than the mark itself. */}
        {data.map((_, i) => (
          <rect
            key={i}
            x={x(i) - plotWidth / data.length / 2}
            y={padding.top}
            width={Math.max(8, plotWidth / data.length)}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
            onFocus={() => setHoverIndex(i)}
            onBlur={() => setHoverIndex(null)}
            tabIndex={0}
            role="button"
            aria-label={`${data[i]?.label ?? ""}: ${series.map((s) => `${s.label} ${formatValue(Number(data[i]?.[s.key]) || 0)}`).join(", ")}`}
          />
        ))}
      </svg>

      {hoverIndex !== null && data[hoverIndex] && (
        <div className="border-border bg-card w-fit rounded-md border px-3 py-2 text-xs shadow-sm">
          <p className="text-muted-foreground mb-1 font-medium">{String(data[hoverIndex].label)}</p>
          {series.map((s) => {
            const hoveredRow = data[hoverIndex];
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: `var(${s.colorVar})` }}
                  aria-hidden
                />
                <span className="text-foreground font-semibold tabular-nums">
                  {formatValue(Number(hoveredRow?.[s.key]) || 0)}
                </span>
                {series.length > 1 && <span className="text-muted-foreground">{s.label}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{String(data[0]?.label ?? "")}</span>
        <span>{String(data[data.length - 1]?.label ?? "")}</span>
      </div>
    </div>
  );
}
