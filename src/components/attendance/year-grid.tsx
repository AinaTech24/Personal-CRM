"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ATTENDANCE_SWATCH, type CellKind } from "@/lib/attendance-ui";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]; // sparse, GitHub-style

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** What the caller decides about a single day: its color kind and its hover content. */
export interface GridCell {
  kind: CellKind;
  tooltip: ReactNode;
}

interface InternalCell {
  key: string;
  weekday: number;
  kind: CellKind;
  tooltip: ReactNode;
}

/**
 * The GitHub-style year contribution grid — shared shell for every attendance
 * heatmap. It owns the layout (week columns, month/weekday labels, today ring)
 * and the hover tooltip chrome; the caller supplies each day's color kind and
 * tooltip body via `cellFor`, so per-user and team-aggregate heatmaps look
 * identical and only differ in content.
 */
export function YearGrid({
  year,
  todayKey,
  cellFor,
}: {
  year: number;
  todayKey: string;
  cellFor: (key: string, weekday: number, future: boolean) => GridCell;
}) {
  const [hover, setHover] = useState<{ tooltip: ReactNode; x: number; y: number } | null>(null);

  const columns = useMemo(() => {
    const cells: InternalCell[] = [];
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${pad(m + 1)}-${pad(d)}`;
        const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay();
        const future = key > todayKey;
        const { kind, tooltip } = cellFor(key, weekday, future);
        cells.push({ key, weekday, kind, tooltip });
      }
    }

    // Bucket into week-columns; pad the first column's leading days (prev year).
    const cols: (InternalCell | null)[][] = [];
    let current: (InternalCell | null)[] = new Array(cells[0].weekday).fill(null);
    for (const cell of cells) {
      current.push(cell);
      if (cell.weekday === 6) {
        cols.push(current);
        current = [];
      }
    }
    if (current.length) {
      while (current.length < 7) current.push(null);
      cols.push(current);
    }
    return cols;
  }, [year, todayKey, cellFor]);

  // Month label positions: the column where each month first appears.
  const monthLabels = useMemo(() => {
    const seen = new Set<number>();
    return columns.map((col) => {
      const firstReal = col.find((c): c is InternalCell => c !== null);
      if (!firstReal) return "";
      const month = Number(firstReal.key.slice(5, 7)) - 1;
      if (seen.has(month)) return "";
      seen.add(month);
      return MONTHS[month];
    });
  }, [columns]);

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-2">
        <div className="inline-flex flex-col gap-1">
          {/* Month labels */}
          <div className="flex gap-[3px] pl-8 text-[10px] text-muted-foreground">
            {monthLabels.map((label, i) => (
              <div key={i} className="w-[13px] shrink-0">
                {label}
              </div>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {/* Weekday labels */}
            <div className="mr-1 flex w-7 flex-col gap-[3px] text-[10px] text-muted-foreground">
              {WEEKDAY_LABELS.map((label, i) => (
                <div key={i} className="h-[13px] leading-[13px]">
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((cell, ri) =>
                  cell === null ? (
                    <div key={ri} className="h-[13px] w-[13px]" />
                  ) : (
                    <div
                      key={ri}
                      className={cn(
                        "h-[13px] w-[13px] rounded-[3px] transition-transform hover:scale-125 hover:ring-1 hover:ring-foreground/30",
                        ATTENDANCE_SWATCH[cell.kind].cell,
                        cell.key === todayKey && "ring-1 ring-foreground"
                      )}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHover({ tooltip: cell.tooltip, x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {hover.tooltip}
        </div>
      )}
    </div>
  );
}
