"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Chart-type options offered per dashboard card. */
export const CHART_TYPES = {
  chart: [
    { value: "bar", label: "Bar chart" },
    { value: "column", label: "Column (horizontal)" },
    { value: "line", label: "Line chart" },
    { value: "area", label: "Area chart" },
  ],
  graph: [
    { value: "donut", label: "Donut" },
    { value: "pie", label: "Pie" },
    { value: "rose", label: "Rose (Nightingale)" },
    { value: "radial", label: "Radial bars" },
  ],
  nodes: [
    { value: "bubble", label: "Bubbles" },
    { value: "treemap", label: "Treemap" },
    { value: "radar", label: "Radar" },
  ],
} as const;

const EASE = [0.16, 1, 0.3, 1] as const;

// ---------------------------------------------------------------------------
// Shared hover tooltip
// ---------------------------------------------------------------------------

interface TipState {
  x: number;
  y: number;
  label: string;
  value: number;
  color: string;
  total: number;
}

function useTip() {
  const [tip, setTip] = React.useState<TipState | null>(null);
  const bind = (s: Slice, total: number) => ({
    onMouseMove: (e: React.MouseEvent) =>
      setTip({ x: e.clientX, y: e.clientY, label: s.label, value: s.value, color: s.color, total }),
    onMouseLeave: () => setTip(null),
  });
  return { tip, bind };
}

function Tip({ tip }: { tip: TipState | null }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {tip && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 4 }}
          transition={{ duration: 0.13, ease: EASE }}
          style={{ position: "fixed", left: tip.x + 14, top: tip.y + 14, zIndex: 120, pointerEvents: "none" }}
          className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: tip.color }} />
            <span className="font-medium">{tip.label}</span>
          </div>
          <div className="mt-0.5 text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{tip.value}</span>
            {tip.total > 0 && <span> · {Math.round((tip.value / tip.total) * 100)}%</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
      No data yet
    </div>
  );
}

const sum = (data: Slice[]) => data.reduce((s, d) => s + d.value, 0);

// ---------------------------------------------------------------------------
// Geometry helpers (SVG polar / arcs)
// ---------------------------------------------------------------------------

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const [x1, y1] = polar(cx, cy, rOuter, end);
  const [x2, y2] = polar(cx, cy, rOuter, start);
  const [x3, y3] = polar(cx, cy, rInner, start);
  const [x4, y4] = polar(cx, cy, rInner, end);
  const large = end - start > 180 ? 1 : 0;
  if (rInner <= 0) {
    return `M${cx},${cy} L${x2},${y2} A${rOuter},${rOuter} 0 ${large} 1 ${x1},${y1} Z`;
  }
  return `M${x1},${y1} A${rOuter},${rOuter} 0 ${large} 0 ${x2},${y2} L${x3},${y3} A${rInner},${rInner} 0 ${large} 1 ${x4},${y4} Z`;
}

/** Cumulative start angles for a set of values across a total sweep. */
function angles(data: Slice[], total: number, sweep = 360) {
  return data.map((_, i) => {
    const before = data.slice(0, i).reduce((s, x) => s + x.value, 0);
    return (before / total) * sweep;
  });
}

// ---------------------------------------------------------------------------
// Category 1 — comparison: Bar, Column
// ---------------------------------------------------------------------------

function BarChart({ data, height }: { data: Slice[]; height: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  const max = Math.max(1, ...data.map((d) => d.value));
  if (total === 0) return <Empty height={height} />;
  const chartH = height - 34;

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 cursor-default flex-col items-center gap-1" {...bind(d, total)}>
          <span className="text-xs font-semibold tabular-nums" style={{ color: d.color }}>
            {d.value}
          </span>
          <div className="flex w-full flex-1 items-end">
            <motion.div
              className="w-full rounded-t-md"
              style={{ backgroundColor: d.color }}
              initial={{ height: 0 }}
              animate={{ height: Math.max(2, Math.round((d.value / max) * chartH)) }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">{d.label}</span>
        </div>
      ))}
      <Tip tip={tip} />
    </div>
  );
}

function ColumnChart({ data, height }: { data: Slice[]; height: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  const max = Math.max(1, ...data.map((d) => d.value));
  if (total === 0) return <Empty height={height} />;

  return (
    <div className="flex flex-col justify-center gap-2.5" style={{ minHeight: height }}>
      {data.map((d) => (
        <div key={d.label} className="flex cursor-default items-center gap-2 text-xs" {...bind(d, total)}>
          <span className="w-20 shrink-0 truncate text-muted-foreground">{d.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded-sm bg-border/60">
            <motion.div
              className="h-full rounded-sm"
              style={{ backgroundColor: d.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </div>
          <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{d.value}</span>
        </div>
      ))}
      <Tip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category 2 — trend: Line, Area
// ---------------------------------------------------------------------------

function LineArea({ data, height, filled }: { data: Slice[]; height: number; filled: boolean }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  if (total === 0) return <Empty height={height} />;

  const W = 320;
  const H = height;
  const padX = 26;
  const padTop = 22;
  const padBottom = 26;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;

  const pts = data.map((d, i) => ({
    x: padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: padTop + innerH - (d.value / max) * innerH,
    d,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${padTop + innerH} L${pts[0].x.toFixed(1)},${padTop + innerH} Z`;
  const accent = data[0]?.color ?? "#dc2626";

  return (
    <div style={{ minHeight: height }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
        {filled && (
          <motion.path
            d={area}
            fill={accent}
            fillOpacity={0.14}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        )}
        <motion.path
          d={line}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: EASE }}
        />
        {pts.map((p) => (
          <g key={p.d.label} {...bind(p.d, total)}>
            <circle cx={p.x} cy={p.y} r={9} fill="transparent" />
            <motion.circle
              cx={p.x}
              cy={p.y}
              r={4}
              fill={p.d.color}
              stroke="var(--popover)"
              strokeWidth={1.5}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, duration: 0.3, ease: EASE }}
            />
            <text x={p.x} y={H - 8} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
              {p.d.label.length > 8 ? `${p.d.label.slice(0, 7)}…` : p.d.label}
            </text>
          </g>
        ))}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category 3 — part-to-whole: Donut, Pie, Rose, Radial
// ---------------------------------------------------------------------------

function PieDonut({ data, height, inner }: { data: Slice[]; height: number; inner: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  if (total === 0) return <Empty height={height} />;

  const size = 156;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 70;
  const starts = angles(data, total);

  return (
    <div className="flex flex-col items-center gap-3" style={{ minHeight: height }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {data.map((d, i) => {
            const start = starts[i];
            const end = start + (d.value / total) * 360;
            return (
              <motion.path
                key={d.label}
                d={arcPath(cx, cy, rOuter, inner, start, Math.max(start + 0.01, end))}
                fill={d.color}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: EASE }}
                style={{ transformOrigin: `${cx}px ${cy}px`, cursor: "default" }}
                {...bind(d, total)}
              />
            );
          })}
          {inner > 0 && <circle cx={cx} cy={cy} r={inner} className="fill-popover" />}
        </svg>
        {inner > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums">{total}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
          </div>
        )}
      </div>
      <Legend data={data} />
      <Tip tip={tip} />
    </div>
  );
}

function RoseChart({ data, height }: { data: Slice[]; height: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  if (total === 0) return <Empty height={height} />;

  const size = 156;
  const cx = size / 2;
  const cy = size / 2;
  const rMax = 72;
  const max = Math.max(1, ...data.map((d) => d.value));
  const seg = 360 / data.length;

  return (
    <div className="flex flex-col items-center gap-3" style={{ minHeight: height }}>
      <svg width={size} height={size}>
        {data.map((d, i) => {
          const r = 18 + Math.sqrt(d.value / max) * (rMax - 18);
          return (
            <motion.path
              key={d.label}
              d={arcPath(cx, cy, r, 0, i * seg, (i + 1) * seg - 1.5)}
              fill={d.color}
              fillOpacity={0.9}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
              style={{ transformOrigin: `${cx}px ${cy}px`, cursor: "default" }}
              {...bind(d, total)}
            />
          );
        })}
      </svg>
      <Legend data={data} />
      <Tip tip={tip} />
    </div>
  );
}

function RadialBars({ data, height }: { data: Slice[]; height: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  if (total === 0) return <Empty height={height} />;

  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const max = Math.max(1, ...data.map((d) => d.value));
  const sweep = 320;
  const ringGap = 15;
  const rStart = 30;

  return (
    <div className="flex flex-col items-center gap-3" style={{ minHeight: height }}>
      <svg width={size} height={size} className="-rotate-90">
        {data.map((d, i) => {
          const r = rStart + i * ringGap;
          const circ = 2 * Math.PI * r;
          const frac = (d.value / max) * (sweep / 360);
          return (
            <g key={d.label} {...bind(d, total)} style={{ cursor: "default" }}>
              <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={10} className="stroke-border/60" />
              <motion.circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={`${frac * circ} ${circ}`}
                initial={{ strokeDashoffset: frac * circ }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
              />
            </g>
          );
        })}
      </svg>
      <Legend data={data} />
      <Tip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category 4 — nodes / relationship: Bubble, Treemap, Radar
// ---------------------------------------------------------------------------

function BubbleChart({ data, height }: { data: Slice[]; height: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  if (total === 0) return <Empty height={height} />;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-wrap items-center justify-center gap-4" style={{ minHeight: height }}>
      {data.map((d) => {
        const diameter = 34 + Math.round(Math.sqrt(d.value / max) * 56);
        return (
          <div key={d.label} className="flex cursor-default flex-col items-center gap-1.5" {...bind(d, total)}>
            <motion.div
              className="flex items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ width: diameter, height: diameter, backgroundColor: d.color }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
            >
              {d.value}
            </motion.div>
            <span className="max-w-20 truncate text-center text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        );
      })}
      <Tip tip={tip} />
    </div>
  );
}

function Treemap({ data, height }: { data: Slice[]; height: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  if (total === 0) return <Empty height={height} />;

  return (
    <div className="flex w-full overflow-hidden rounded-md" style={{ height: Math.max(120, height - 20) }}>
      {data.map((d, i) => (
        <motion.div
          key={d.label}
          className="flex cursor-default flex-col justify-end overflow-hidden p-2 text-white"
          style={{ backgroundColor: d.color }}
          initial={{ flexGrow: 0, opacity: 0 }}
          animate={{ flexGrow: d.value / total, opacity: 1 }}
          transition={{ duration: 0.55, delay: i * 0.05, ease: EASE }}
          {...bind(d, total)}
        >
          <span className="truncate text-[11px] font-medium opacity-90">{d.label}</span>
          <span className="text-lg font-semibold tabular-nums leading-none">{d.value}</span>
        </motion.div>
      ))}
      <Tip tip={tip} />
    </div>
  );
}

function Radar({ data, height }: { data: Slice[]; height: number }) {
  const { tip, bind } = useTip();
  const total = sum(data);
  if (total === 0) return <Empty height={height} />;

  const size = 176;
  const cx = size / 2;
  const cy = size / 2;
  const R = 66;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const step = 360 / n;
  const rings = [0.33, 0.66, 1];

  const vertices = data.map((d, i) => {
    const [x, y] = polar(cx, cy, (d.value / max) * R, i * step);
    return { x, y, d };
  });
  const poly = vertices.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ");
  const accent = data[0]?.color ?? "#dc2626";

  return (
    <div className="flex flex-col items-center gap-2" style={{ minHeight: height }}>
      <svg width={size} height={size}>
        {rings.map((f) => (
          <polygon
            key={f}
            points={data.map((_, i) => polar(cx, cy, R * f, i * step).map((n2) => n2.toFixed(1)).join(",")).join(" ")}
            fill="none"
            className="stroke-border"
            strokeWidth={1}
          />
        ))}
        {data.map((_, i) => {
          const [x, y] = polar(cx, cy, R, i * step);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="stroke-border" strokeWidth={1} />;
        })}
        <motion.polygon
          points={poly}
          fill={accent}
          fillOpacity={0.22}
          stroke={accent}
          strokeWidth={2}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        {vertices.map((v) => (
          <g key={v.d.label} {...bind(v.d, total)} style={{ cursor: "default" }}>
            <circle cx={v.x} cy={v.y} r={10} fill="transparent" />
            <circle cx={v.x} cy={v.y} r={3.5} fill={v.d.color} />
          </g>
        ))}
        {data.map((d, i) => {
          const [x, y] = polar(cx, cy, R + 12, i * step);
          return (
            <text key={d.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" style={{ fontSize: 8.5 }}>
              {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
            </text>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

function Legend({ data }: { data: Slice[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
          <span className="text-muted-foreground">{d.label}</span>
          <span className="font-semibold tabular-nums">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function Chart({ type, data, height = 200 }: { type: string; data: Slice[]; height?: number }) {
  switch (type) {
    case "column":
      return <ColumnChart data={data} height={height} />;
    case "line":
      return <LineArea data={data} height={height} filled={false} />;
    case "area":
      return <LineArea data={data} height={height} filled />;
    case "pie":
      return <PieDonut data={data} height={height} inner={0} />;
    case "donut":
      return <PieDonut data={data} height={height} inner={40} />;
    case "rose":
      return <RoseChart data={data} height={height} />;
    case "radial":
      return <RadialBars data={data} height={height} />;
    case "treemap":
      return <Treemap data={data} height={height} />;
    case "radar":
      return <Radar data={data} height={height} />;
    case "bubble":
      return <BubbleChart data={data} height={height} />;
    case "bar":
    default:
      return <BarChart data={data} height={height} />;
  }
}
