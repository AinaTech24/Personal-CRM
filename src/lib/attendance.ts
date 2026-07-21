import type { AttendanceStatus } from "@/generated/prisma/enums";

/**
 * Attendance is fixed to the Asia/Kolkata calendar (the app is IST-only). The
 * day boundary — "which date does a check-in belong to" — is derived from IST
 * wall-clock, never the server's local zone, so results don't shift if the host
 * runs in UTC. A date with no time is stored as UTC midnight of that IST day.
 */
const IST_OFFSET_MINUTES = 5.5 * 60;

/** The IST calendar day for an instant, as "YYYY-MM-DD". */
export function istDateKey(instant: Date = new Date()): string {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** A "YYYY-MM-DD" key as a Date at UTC midnight — how DATE columns round-trip. */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** The stored DATE (UTC midnight) back to its "YYYY-MM-DD" key. */
export function keyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** JS getDay() (0=Sun..6=Sat) for a date key, evaluated as a plain calendar day. */
export function weekdayOfKey(key: string): number {
  return dateFromKey(key).getUTCDay();
}

/** An admin-defined check-in/check-out window, in IST "HH:mm". */
export interface AttendanceShift {
  name: string;
  type: "FULL_DAY" | "HALF_DAY";
  checkInStart: string;
  checkInEnd: string;
  checkOutStart: string;
  checkOutEnd: string;
}

export interface AttendancePolicy {
  fullDayMinutes: number;
  halfDayMinutes: number;
  requireApproval: boolean;
  requireHalfDayReason: boolean;
  workingWeekdays: number[]; // JS getDay() numbers
  shifts: AttendanceShift[];
}

/** Current IST wall-clock as minutes past midnight. */
export function istMinutesOfDay(instant: Date = new Date()): number {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** "HH:mm" → minutes past midnight; NaN when unparseable. */
export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Is `minutes` inside [start, end]? Windows that wrap past midnight are supported. */
export function withinWindow(minutes: number, start: string, end: string): boolean {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return true; // unconfigured → don't block
  return s <= e ? minutes >= s && minutes <= e : minutes >= s || minutes <= e;
}

/**
 * The shifts a user may check in on right now. `allowedTypes` narrows by
 * entitlement — someone on half-day leave may only use HALF_DAY shifts.
 */
export function shiftsOpenForCheckIn(
  shifts: AttendanceShift[],
  allowedTypes: AttendanceShift["type"][],
  atMinutes: number
): AttendanceShift[] {
  return shifts.filter((s) => allowedTypes.includes(s.type) && withinWindow(atMinutes, s.checkInStart, s.checkInEnd));
}

export const DEFAULT_POLICY: AttendancePolicy = {
  fullDayMinutes: 480,
  halfDayMinutes: 240,
  requireApproval: true,
  requireHalfDayReason: false,
  workingWeekdays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  shifts: [],
};

/** Parses the stored "1,2,3,4,5,6" weekday string into numbers. */
export function parseWorkingWeekdays(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** Whole minutes between check-in and check-out; null if either is missing or out of order. */
export function computeWorkedMinutes(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  const mins = Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000);
  return mins > 0 ? mins : 0;
}

/**
 * Maps worked minutes to a status using the configured thresholds — never
 * hardcoded. >= full → PRESENT, >= half → HALF_DAY, else ABSENT.
 */
export function classifyStatus(workedMinutes: number, policy: AttendancePolicy): AttendanceStatus {
  if (workedMinutes >= policy.fullDayMinutes) return "PRESENT";
  if (workedMinutes >= policy.halfDayMinutes) return "HALF_DAY";
  return "ABSENT";
}

export function isWorkingDay(key: string, policy: AttendancePolicy, holidayKeys: Set<string>): boolean {
  if (holidayKeys.has(key)) return false;
  return policy.workingWeekdays.includes(weekdayOfKey(key));
}

export interface AttendanceSummary {
  present: number;
  halfDay: number;
  absent: number;
  pending: number;
  /** Finalized working days = present + halfDay + absent (excludes pending/rejected). */
  workingDays: number;
  /** present + halfDay*0.5 */
  attendanceEquivalent: number;
  /** (equivalent / workingDays) * 100, or 0 when no finalized days. */
  attendancePercent: number;
}

/** A record as the summary needs to see it. */
export interface SummaryRecord {
  status: AttendanceStatus | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
}

/**
 * Summary over a set of records. Only APPROVED records (or all finalized, when
 * approval isn't required) count toward Present/Half/Absent; PENDING is surfaced
 * separately and REJECTED is ignored entirely. This matches the spec's example
 * where Working Days = present + half + absent and the two Pending are excluded.
 *
 * @param countUnapproved when approval is off, finalized records count without
 *   an explicit APPROVED stamp (they're auto-approved on check-out).
 */
export function summarize(records: SummaryRecord[]): AttendanceSummary {
  let present = 0;
  let halfDay = 0;
  let absent = 0;
  let pending = 0;

  for (const r of records) {
    // A record with no finalized status (checked in, not out) counts as pending.
    if (r.approvalStatus === "REJECTED") continue;
    if (r.approvalStatus === "PENDING" || r.status === null) {
      pending += 1;
      continue;
    }
    if (r.status === "PRESENT") present += 1;
    else if (r.status === "HALF_DAY") halfDay += 1;
    else if (r.status === "ABSENT") absent += 1;
  }

  const workingDays = present + halfDay + absent;
  const attendanceEquivalent = present + halfDay * 0.5;
  const attendancePercent = workingDays === 0 ? 0 : (attendanceEquivalent / workingDays) * 100;

  return {
    present,
    halfDay,
    absent,
    pending,
    workingDays,
    attendanceEquivalent,
    // Two decimals, matching the spec's 84.62% / 93.3% examples.
    attendancePercent: Math.round(attendancePercent * 100) / 100,
  };
}

/** The default auto-reason for a system-classified Half Day (no shift data to say late vs early). */
export const AUTO_HALF_DAY_REASON = "INSUFFICIENT_HOURS" as const;
