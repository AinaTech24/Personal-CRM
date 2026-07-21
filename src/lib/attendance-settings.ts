import { db } from "@/lib/db";
import { DEFAULT_POLICY, parseWorkingWeekdays, type AttendancePolicy, type AttendanceShift } from "@/lib/attendance";

/** Parse the stored shifts JSON, dropping anything malformed. */
export function parseShifts(value: unknown): AttendanceShift[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const s = raw as Record<string, unknown>;
    const type = s.type === "HALF_DAY" ? "HALF_DAY" : "FULL_DAY";
    const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
    if (!str("checkInStart") || !str("checkInEnd")) return [];
    return [
      {
        name: str("name") || (type === "HALF_DAY" ? "Half day" : "Full day"),
        type,
        checkInStart: str("checkInStart"),
        checkInEnd: str("checkInEnd"),
        checkOutStart: str("checkOutStart"),
        checkOutEnd: str("checkOutEnd"),
      } satisfies AttendanceShift,
    ];
  });
}

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
    shifts: parseShifts(row.shifts),
  };
}

/** Holiday date keys ("YYYY-MM-DD") for fast working-day checks. */
export async function getHolidayKeys(): Promise<Set<string>> {
  const rows = await db.holiday.findMany({ select: { date: true } }).catch(() => []);
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}
