"use client";

import { useMemo } from "react";
import type { AttendanceStatus, AttendanceApproval, HalfDayReason } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export interface AttendanceDayRecord {
  date: string; // YYYY-MM-DD
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number | null;
  status: AttendanceStatus | null;
  halfDayReason: HalfDayReason | null;
  approvalStatus: AttendanceApproval;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface MonthRow {
  index: number;
  name: string;
  present: number;
  halfDay: number;
  absent: number;
  pending: number;
  /** Finalized days that count toward the bar: present + halfDay + absent. */
  total: number;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * The year at a glance as a month-by-month list. Each row is a month with a
 * proportional Present / Half Day / Absent bar and the counts — a compact,
 * full-width alternative to the calendar grid. Only months that have started
 * (for the selected year) are shown.
 */
export function YearList({ year, records, todayKey }: { year: number; records: AttendanceDayRecord[]; todayKey: string }) {
  const months = useMemo(() => {
    const rows: MonthRow[] = [];
    for (let m = 0; m < 12; m++) {
      const monthStart = `${year}-${pad(m + 1)}-01`;
      if (monthStart > todayKey) break; // future month — nothing to show yet
      let present = 0;
      let halfDay = 0;
      let absent = 0;
      let pending = 0;
      for (const r of records) {
        if (Number(r.date.slice(5, 7)) - 1 !== m) continue;
        if (r.approvalStatus === "REJECTED") continue;
        if (r.approvalStatus === "PENDING" || r.status === null) {
          pending += 1;
          continue;
        }
        if (r.status === "PRESENT") present += 1;
        else if (r.status === "HALF_DAY") halfDay += 1;
        else if (r.status === "ABSENT") absent += 1;
      }
      rows.push({ index: m, name: MONTHS[m], present, halfDay, absent, pending, total: present + halfDay + absent });
    }
    return rows;
  }, [year, records, todayKey]);

  if (months.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No months to show for {year} yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {months.map((mo) => (
        <li key={mo.index} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
          <span className="w-24 shrink-0 text-sm font-medium">{mo.name}</span>

          <div className="flex h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
            {mo.total > 0 && (
              <>
                <span className="bg-emerald-500" style={{ width: `${(mo.present / mo.total) * 100}%` }} />
                <span className="bg-amber-400" style={{ width: `${(mo.halfDay / mo.total) * 100}%` }} />
                <span className="bg-red-500" style={{ width: `${(mo.absent / mo.total) * 100}%` }} />
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <Count dot="bg-emerald-500" value={mo.present} label="present" />
            <Count dot="bg-amber-400" value={mo.halfDay} label="half" />
            <Count dot="bg-red-500" value={mo.absent} label="absent" />
            {mo.pending > 0 && <span className="text-muted-foreground/70">· {mo.pending} pending</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Count({ dot, value, label }: { dot: string; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      <span className="font-medium text-foreground">{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
