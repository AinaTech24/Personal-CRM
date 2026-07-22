"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface LinePoint {
  /** Stable identity for the point, also used as the tooltip's heading. */
  label: string;
  value: number;
  /** Optional second line under the heading, e.g. "3 entries". */
  detail?: string;
}

interface LineChartProps {
  points: LinePoint[];
  /** Formats the y-axis ticks and the tooltip value. */
  formatValue?: (v: number) => string;
  height?: number;
  className?: string;
  emptyMessage?: string;
  /** Drawn as a dashed horizontal rule, e.g. an average or a target. */
  reference?: { value: number; label: string } | null;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

/**
 * Picks axis ticks on 1-2-5 boundaries so the labels land on round numbers
 * instead of on whatever the data's maximum happened to be.
 */
function niceTicks(max: number, targetCount = 4): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * A line chart drawn straight into SVG.
 *
 * Sized from a measured container rather than a scaling viewBox: stretching a
 * viewBox to fit would scale the stroke widths and the axis text along with the
 * plot, so a wide chart would end up with hairline gridlines and squashed
 * labels.
 */
export function LineChart({
  points,
  formatValue = (v) => String(v),
  height = 220,
  className,
  emptyMessage = "No data yet",
  reference = null,
}: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  const geometry = useMemo(() => {
    if (points.length === 0 || plotW <= 0) return null;

    const maxValue = Math.max(...points.map((p) => p.value), reference?.value ?? 0);
    const ticks = niceTicks(maxValue);
    const top = ticks[ticks.length - 1] || 1;

    // A single point has no span to divide by; centring it avoids a divide-by-zero
    // that would otherwise place it at NaN and silently blank the chart.
    const x = (i: number) =>
      points.length === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (points.length - 1)) * plotW;
    const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
    const area = `${line} L${x(points.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;

    // Thin the x labels to whatever fits: ~64px each, so they never collide.
    const maxLabels = Math.max(2, Math.floor(plotW / 64));
    const labelStep = Math.ceil(points.length / maxLabels);

    return { ticks, top, x, y, line, area, labelStep };
  }, [points, plotW, plotH, reference]);

  /** Nearest point to the pointer, so the guide snaps rather than floating. */
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!geometry || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (points.length === 1) return setHover(0);
    const ratio = (localX - PAD.left) / plotW;
    const index = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, index)));
  }

  if (points.length === 0) {
    return (
      <div
        ref={wrapRef}
        style={{ height }}
        className={cn("flex items-center justify-center rounded-md bg-accent/30 text-xs text-muted-foreground", className)}
      >
        {emptyMessage}
      </div>
    );
  }

  const active = hover !== null ? points[hover] : null;

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      {width > 0 && geometry && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Line chart of ${points.length} points`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          className="touch-none"
        >
          <defs>
            <linearGradient id="line-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines and y labels */}
          {geometry.ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={geometry.y(t)}
                y2={geometry.y(t)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={t === 0 ? undefined : "3 3"}
              />
              <text
                x={PAD.left - 8}
                y={geometry.y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {formatValue(t)}
              </text>
            </g>
          ))}

          {reference && (
            <g>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={geometry.y(reference.value)}
                y2={geometry.y(reference.value)}
                stroke="var(--primary)"
                strokeWidth={1}
                strokeDasharray="5 4"
                opacity={0.5}
              />
              <text
                x={PAD.left + plotW}
                y={geometry.y(reference.value) - 4}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {reference.label}
              </text>
            </g>
          )}

          <path d={geometry.area} fill="url(#line-chart-fill)" />
          <path
            d={geometry.line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Dots only when they won't merge into a solid bar. */}
          {plotW / points.length > 14 &&
            points.map((p, i) => (
              <circle
                key={p.label}
                cx={geometry.x(i)}
                cy={geometry.y(p.value)}
                r={hover === i ? 4 : 2.5}
                fill="var(--background)"
                stroke="var(--primary)"
                strokeWidth={2}
              />
            ))}

          {/* X labels */}
          {points.map((p, i) =>
            i % geometry.labelStep === 0 || i === points.length - 1 ? (
              <text
                key={p.label}
                x={geometry.x(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {p.label}
              </text>
            ) : null
          )}

          {hover !== null && (
            <>
              <line
                x1={geometry.x(hover)}
                x2={geometry.x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--primary)"
                strokeWidth={1}
                opacity={0.4}
              />
              <circle
                cx={geometry.x(hover)}
                cy={geometry.y(points[hover].value)}
                r={4}
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      )}

      {active && geometry && (
        <div
          // Clamped to the container so a tooltip near either edge stays on screen.
          style={{
            left: Math.min(Math.max(geometry.x(hover!), 60), Math.max(width - 60, 60)),
            top: 4,
          }}
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-center shadow-md"
        >
          <p className="text-xs font-medium">{formatValue(active.value)}</p>
          <p className="text-[10px] text-muted-foreground">{active.label}</p>
          {active.detail && <p className="text-[10px] text-muted-foreground">{active.detail}</p>}
        </div>
      )}
    </div>
  );
}
