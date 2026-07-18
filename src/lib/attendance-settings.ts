import { db } from "@/lib/db";
import { DEFAULT_POLICY, parseWorkingWeekdays, type AttendancePolicy } from "@/lib/attendance";

/**
 * The active classification policy. Admin-configured row wins; a missing row
 * falls back to sensible defaults (8h / 4h, approval on, Mon–Sat) so the module
 * works before anyone visits the settings page. Thresholds are never hardcoded
 * at the call sites — they all read this.
 */
export async function getAttendancePolicy(): Promise<AttendancePolicy> {
  const row = await db.attendanceSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  if (!row) return DEFAULT_POLICY;
  return {
    fullDayMinutes: row.fullDayMinutes,
    halfDayMinutes: row.halfDayMinutes,
    requireApproval: row.requireApproval,
    requireHalfDayReason: row.requireHalfDayReason,
    workingWeekdays: parseWorkingWeekdays(row.workingWeekdays),
  };
}

/** Holiday date keys ("YYYY-MM-DD") for fast working-day checks. */
export async function getHolidayKeys(): Promise<Set<string>> {
  const rows = await db.holiday.findMany({ select: { date: true } }).catch(() => []);
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}
