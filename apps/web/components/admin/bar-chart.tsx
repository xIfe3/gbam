"use client";

import { formatNaira } from "@gbam/shared";
import { useState } from "react";
import { shortDay } from "./range";

export type ChartPoint = { day: string; value: number };

type Props = {
  title: string;
  points: ChartPoint[];
  /** "naira": values are kobo, shown as ₦. "count": plain numbers. */
  unit: "naira" | "count";
};

// The drawing area, in SVG units (the SVG scales to the page width).
const WIDTH = 640;
const HEIGHT = 220;
const LEFT = 64; // room for the y-axis numbers
const BOTTOM = 24; // room for the dates
const TOP = 8;
const MAX_BAR = 24; // bars stay thin, whatever the number of days
const MAX_DATE_LABELS = 6;

function formatValue(value: number, unit: Props["unit"]): string {
  if (unit === "naira") {
    return formatNaira(value);
  }
  return value.toLocaleString("en-NG");
}

/**
 * A "nice" top for the y axis (1, 2 or 5 times a power of ten), so the axis numbers are round:
 * 0 / 2,000 / 4,000 rather than 0 / 1,873 / 3,746.
 */
function niceStep(max: number): number {
  const rough = max / 4;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const steps = [1, 2, 5, 10];
  for (const step of steps) {
    if (step * power >= rough) {
      return step * power;
    }
  }
  return 10 * power;
}

/** A bar with a rounded top (4px) and a square bottom sitting on the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(4, height, width / 2);
  const bottom = y + height;
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + width - radius} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + radius}`,
    `L ${x + width} ${bottom}`,
    "Z",
  ].join(" ");
}

/**
 * A one-series bar chart of a value per day, drawn as plain SVG. Hover or tab to a day to see
 * its value; the same numbers are in a summary sentence and a table, so nothing depends on
 * seeing the bars.
 */
export function BarChart({ title, points, unit }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  let total = 0;
  let highest: ChartPoint | null = null;
  for (const point of points) {
    total = total + point.value;
    if (highest === null || point.value > highest.value) {
      highest = point;
    }
  }

  let dayWord = "days";
  if (points.length === 1) {
    dayWord = "day";
  }

  const plotWidth = WIDTH - LEFT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const baseline = TOP + plotHeight;
  let band = plotWidth;
  if (points.length > 0) {
    band = plotWidth / points.length;
  }
  // A 2px gap between neighbouring bars, and never wider than MAX_BAR.
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - 2));

  let highestValue = 0;
  if (highest !== null) {
    highestValue = highest.value;
  }
  let step = 1;
  if (highestValue > 0) {
    step = niceStep(highestValue);
  }
  // Round numbers from 0 up to the first one at or above the highest bar.
  const ticks: number[] = [0];
  let axisTop = 0;
  while (axisTop < highestValue || ticks.length < 2) {
    axisTop = axisTop + step;
    ticks.push(axisTop);
  }

  // Only some dates fit under the bars; the tooltip and the table have them all.
  const labelEvery = Math.max(1, Math.ceil(points.length / MAX_DATE_LABELS));

  function yFor(value: number): number {
    return baseline - (value / axisTop) * plotHeight;
  }

  let tooltip = null;
  if (hovered !== null) {
    const point = points[hovered];
    if (point) {
      const centre = LEFT + band * hovered + band / 2;
      const leftPercent = (centre / WIDTH) * 100;
      tooltip = (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
          style={{ left: `${leftPercent}%` }}
        >
          <strong className="text-ink block">{formatValue(point.value, unit)}</strong>
          <span className="text-ink-muted block">{shortDay(point.day)}</span>
        </div>
      );
    }
  }

  return (
    <figure aria-label={title} className="rounded-xl border border-zinc-200 bg-white p-5">
      <figcaption className="text-ink font-bold">{title}</figcaption>
      {total === 0 && <p className="text-ink-muted mt-2 text-sm">Nothing in this range yet.</p>}
      {total > 0 && highest !== null && (
        <p className="text-ink-muted mt-1 text-sm">
          Highest: {formatValue(highest.value, unit)} on {shortDay(highest.day)}. Total:{" "}
          {formatValue(total, unit)} over {points.length} {dayWord}.
        </p>
      )}

      {total > 0 && (
        <div className="relative mt-4">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="block h-auto w-full"
            onPointerLeave={() => setHovered(null)}
          >
            {/* Recessive gridlines and their round numbers. */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={LEFT}
                  x2={WIDTH}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="#e4e4e7"
                  strokeWidth={1}
                />
                <text
                  x={LEFT - 8}
                  y={yFor(tick) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--color-ink-subtle)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatValue(tick, unit)}
                </text>
              </g>
            ))}

            {points.map((point, index) => {
              const x = LEFT + band * index + (band - barWidth) / 2;
              const y = yFor(point.value);
              const height = baseline - y;
              const label = `${shortDay(point.day)}: ${formatValue(point.value, unit)}`;
              let opacity = 1;
              if (hovered !== null && hovered !== index) {
                opacity = 0.45;
              }
              return (
                <g key={point.day}>
                  {height > 0 && (
                    <path
                      d={barPath(x, y, barWidth, height)}
                      fill="var(--color-brand)"
                      opacity={opacity}
                    />
                  )}
                  {index % labelEvery === 0 && (
                    <text
                      x={LEFT + band * index + band / 2}
                      y={HEIGHT - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--color-ink-subtle)"
                    >
                      {shortDay(point.day)}
                    </text>
                  )}
                  {/* The whole column is the hover and focus target, bigger than the bar. */}
                  <rect
                    x={LEFT + band * index}
                    y={TOP}
                    width={band}
                    height={plotHeight}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={label}
                    onPointerEnter={() => setHovered(index)}
                    onFocus={() => setHovered(index)}
                    onBlur={() => setHovered(null)}
                  />
                </g>
              );
            })}
          </svg>
          {tooltip}
        </div>
      )}

      <details className="mt-3 text-sm">
        <summary className="text-brand cursor-pointer font-bold">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1">Day</th>
              <th className="py-1 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.day} className="border-t border-zinc-100">
                <th scope="row" className="py-1 font-normal">
                  {shortDay(point.day)}
                </th>
                <td className="py-1 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatValue(point.value, unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
