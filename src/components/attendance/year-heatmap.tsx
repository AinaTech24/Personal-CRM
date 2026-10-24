"use client";

import { useCallback } from "react";
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
import { YearGrid, type GridCell } from "@/components/attendance/year-grid";

export interface HeatmapRecord {
  date: string; // YYYY-MM-DD
  checkIn: string | null;
  checkOut: string | null;
  breakIn?: string | null;
  breakMinutes?: number | null;
  workedMinutes: number | null;
  status: AttendanceStatus | null;
  halfDayReason: HalfDayReason | null;
  approvalStatus: AttendanceApproval;
}

/**
 * GitHub-style contribution grid for one user's year, colored by attendance
 * status. Sunday is always blue and is never overwritten by a status (per
 * spec); future days and days with no finalized record render neutral.
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
  const cellFor = useCallback(
    (key: string, weekday: number, future: boolean): GridCell => {
      const record = records.find((r) => r.date === key);
      const holidayName = holidays.find((h) => h.date === key)?.name;

      let kind: CellKind;
      if (future) kind = "NONE";
      else if (weekday === 0) kind = "SUNDAY";
      else if (record && record.approvalStatus !== "REJECTED" && record.status) kind = record.status;
      else if (holidayName) kind = "HOLIDAY";
      else kind = "NONE";

      return {
        kind,
        tooltip: <DayTooltip dateKey={key} weekday={weekday} future={future} record={record} holidayName={holidayName} />,
      };
    },
    [records, holidays]
  );

  return <YearGrid year={year} todayKey={todayKey} cellFor={cellFor} />;
}

function DayTooltip({
  dateKey,
  weekday,
  future,
  record,
  holidayName,
}: {
  dateKey: string;
  weekday: number;
  future: boolean;
  record?: HeatmapRecord;
  holidayName?: string;
}) {
  return (
    <>
      <p className="font-medium">{formatFullDate(dateKey)}</p>

      {weekday === 0 && !(record && record.status) ? (
        <p className="text-blue-500">Sunday</p>
      ) : future ? (
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
    </>
  );
}
