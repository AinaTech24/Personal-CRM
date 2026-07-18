"use client";

import { useMemo, useState } from "react";
import type { AttendanceStatus, AttendanceApproval, HalfDayReason } from "@/generated/prisma/enums";
import {
  ATTENDANCE_SWATCH,
  STATUS_LABEL,
  APPROVAL_LABEL,
  HALF_DAY_REASON_LABEL,
  formatDuration,
  formatIstTime,
  formatFullDate,
  type CellKind,
} from "@/lib/attendance-ui";
import { cn } from "@/lib/utils";

export interface HeatmapRecord {
  date: string; // YYYY-MM-DD
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number | null;
  status: AttendanceStatus | null;
  halfDayReason: HalfDayReason | null;
  approvalStatus: AttendanceApproval;
}

interface Cell {
  key: string; // YYYY-MM-DD
  kind: CellKind;
  weekday: number;
  record?: HeatmapRecord;
  holidayName?: string;
  future: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]; // sparse, GitHub-style

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * GitHub-style contribution grid for one year, colored by attendance status.
 * Sunday is always blue and is never overwritten by a status (per spec); future
 * days and days with no finalized record render neutral.
 */
export function YearHeatmap({
  year,
  records,
  holidays,
  todayKey,
}: {
  year: number;
  records: HeatmapRecord[];
  holidays: { date: string; name: string }[];
  todayKey: string;
}) {
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null);

  const columns = useMemo(() => {
    const byDate = new Map(records.map((r) => [r.date, r]));
    const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));

    const cells: Cell[] = [];
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${pad(m + 1)}-${pad(d)}`;
        const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay();
        const record = byDate.get(key);
        const holidayName = holidayByDate.get(key);
        const future = key > todayKey;

        let kind: CellKind;
        if (future) kind = "NONE";
        else if (weekday === 0) kind = "SUNDAY";
        else if (record && record.approvalStatus !== "REJECTED" && record.status) kind = record.status;
        else if (holidayName) kind = "HOLIDAY";
        else kind = "NONE";

        cells.push({ key, kind, weekday, record, holidayName, future });
      }
    }

    // Bucket into week-columns; pad the first column's leading days (prev year).
    const cols: (Cell | null)[][] = [];
    let current: (Cell | null)[] = new Array(cells[0].weekday).fill(null);
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
  }, [year, records, holidays, todayKey]);

  // Month label positions: the column where each month first appears.
  const monthLabels = useMemo(() => {
    const seen = new Set<number>();
    return columns.map((col) => {
      const firstReal = col.find((c): c is Cell => c !== null);
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
                        setHover({ cell, x: rect.left + rect.width / 2, y: rect.top });
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

      {hover && <HeatmapTooltip cell={hover.cell} x={hover.x} y={hover.y} />}
    </div>
  );
}

function HeatmapTooltip({ cell, x, y }: { cell: Cell; x: number; y: number }) {
  const { record, kind, holidayName } = cell;
  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
      style={{ left: x, top: y - 8 }}
    >
      <p className="font-medium">{formatFullDate(cell.key)}</p>

      {kind === "SUNDAY" ? (
        <p className="text-blue-500">Sunday</p>
      ) : cell.future ? (
        <p className="text-muted-foreground">Upcoming</p>
      ) : record && record.status ? (
        <>
          <p className={cn("font-medium", ATTENDANCE_SWATCH[record.status].badge, "bg-transparent px-0")}>
            {STATUS_LABEL[record.status]}
            {record.approvalStatus !== "APPROVED" && (
              <span className="ml-1 font-normal text-muted-foreground">({APPROVAL_LABEL[record.approvalStatus]})</span>
            )}
          </p>
          {record.checkIn && <p className="text-muted-foreground">Check In: {formatIstTime(record.checkIn)}</p>}
          {record.checkOut && <p className="text-muted-foreground">Check Out: {formatIstTime(record.checkOut)}</p>}
          {record.workedMinutes != null && (
            <p className="text-muted-foreground">Work Duration: {formatDuration(record.workedMinutes)}</p>
          )}
          {record.status === "HALF_DAY" && record.halfDayReason && (
            <p className="text-muted-foreground">Reason: {HALF_DAY_REASON_LABEL[record.halfDayReason]}</p>
          )}
        </>
      ) : holidayName ? (
        <p className="text-blue-500">Holiday: {holidayName}</p>
      ) : (
        <p className="text-muted-foreground">No data</p>
      )}
    </div>
  );
}
