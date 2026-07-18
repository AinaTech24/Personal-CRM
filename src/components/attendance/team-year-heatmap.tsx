"use client";

import { useCallback, useMemo } from "react";
import { formatFullDate, type CellKind } from "@/lib/attendance-ui";
import { YearGrid, type GridCell } from "@/components/attendance/year-grid";

export interface TeamDay {
  date: string; // YYYY-MM-DD
  present: number;
  halfDay: number;
  absent: number;
  pending: number;
}

/**
 * Team-wide year heatmap for admins. Each day aggregates every user's record:
 * the cell is colored by the day's dominant status, and hovering shows the
 * Present / Half Day / Absent (and Pending) counts for that day.
 */
export function TeamYearHeatmap({
  year,
  days,
  holidays,
  todayKey,
}: {
  year: number;
  days: TeamDay[];
  holidays: { date: string; name: string }[];
  todayKey: string;
}) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const holidayByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h.name])), [holidays]);

  const cellFor = useCallback(
    (key: string, weekday: number, future: boolean): GridCell => {
      const day = byDate.get(key);
      const holidayName = holidayByDate.get(key);
      const finalized = day ? day.present + day.halfDay + day.absent : 0;

      let kind: CellKind;
      if (future) kind = "NONE";
      else if (weekday === 0) kind = "SUNDAY";
      else if (day && finalized > 0) kind = dominantKind(day);
      else if (holidayName) kind = "HOLIDAY";
      else kind = "NONE";

      return { kind, tooltip: <TeamTooltip dateKey={key} weekday={weekday} future={future} day={day} holidayName={holidayName} /> };
    },
    [byDate, holidayByDate]
  );

  return <YearGrid year={year} todayKey={todayKey} cellFor={cellFor} />;
}

/** The status with the most people that day; ties break Present > Half Day > Absent. */
function dominantKind(day: TeamDay): CellKind {
  if (day.present >= day.halfDay && day.present >= day.absent) return "PRESENT";
  if (day.halfDay >= day.absent) return "HALF_DAY";
  return "ABSENT";
}

function TeamTooltip({
  dateKey,
  weekday,
  future,
  day,
  holidayName,
}: {
  dateKey: string;
  weekday: number;
  future: boolean;
  day?: TeamDay;
  holidayName?: string;
}) {
  const hasCounts = day && day.present + day.halfDay + day.absent + day.pending > 0;
  return (
    <>
      <p className="font-medium">{formatFullDate(dateKey)}</p>
      {future ? (
        <p className="text-muted-foreground">Upcoming</p>
      ) : hasCounts ? (
        <div className="mt-0.5 space-y-0.5">
          <p className="text-emerald-500">Present: {day!.present}</p>
          <p className="text-amber-500">Half Day: {day!.halfDay}</p>
          <p className="text-red-500">Absent: {day!.absent}</p>
          {day!.pending > 0 && <p className="text-muted-foreground">Pending: {day!.pending}</p>}
        </div>
      ) : weekday === 0 ? (
        <p className="text-blue-500">Sunday</p>
      ) : holidayName ? (
        <p className="text-blue-500">Holiday: {holidayName}</p>
      ) : (
        <p className="text-muted-foreground">No records</p>
      )}
    </>
  );
}
