import type { AttendanceShift } from "@/lib/attendance";
import { hhmmToMinutes } from "@/lib/attendance";

/** How soon before a window closes to nudge someone who hasn't acted yet. */
export const REMINDER_LEAD_MINUTES = 30;

export interface ReminderUserState {
  userId: string;
  /** Today's leave, if any — full-day means no reminders at all, half-day narrows to HALF_DAY shifts. */
  leaveType: "FULL_DAY" | "HALF_DAY" | null;
  checkedIn: boolean;
  checkedOut: boolean;
}

export interface ReminderCandidate {
  userId: string;
  kind: "check_in_reminder" | "check_out_reminder";
  shiftName: string;
}

/** Is `nowMinutes` within the last `leadMinutes` before `endMinutes`? Wraps past midnight, same as withinWindow. */
function withinLeadWindow(nowMinutes: number, endMinutes: number, leadMinutes: number): boolean {
  const start = (endMinutes - leadMinutes + 1440) % 1440;
  return start <= endMinutes ? nowMinutes >= start && nowMinutes <= endMinutes : nowMinutes >= start || nowMinutes <= endMinutes;
}

/**
 * Who needs a check-in or check-out nudge right now, and for which shift.
 *
 * Pure and DB-free by design — the route does all the fetching and hands in
 * plain state, so this stays unit-testable without a database. Only fires in
 * the last REMINDER_LEAD_MINUTES of a window, not the instant it opens — a
 * reminder should mean "don't forget, it's closing soon," not "you may act
 * now" (check-in/check-out already tell you that when you try).
 */
export function computeReminders(
  shifts: AttendanceShift[],
  users: ReminderUserState[],
  nowMinutes: number
): ReminderCandidate[] {
  const results: ReminderCandidate[] = [];

  for (const user of users) {
    if (user.leaveType === "FULL_DAY") continue;
    const allowedTypes: AttendanceShift["type"][] = user.leaveType === "HALF_DAY" ? ["HALF_DAY"] : ["FULL_DAY", "HALF_DAY"];

    for (const shift of shifts) {
      if (!allowedTypes.includes(shift.type)) continue;

      if (!user.checkedIn) {
        const end = hhmmToMinutes(shift.checkInEnd);
        if (!Number.isNaN(end) && withinLeadWindow(nowMinutes, end, REMINDER_LEAD_MINUTES)) {
          results.push({ userId: user.userId, kind: "check_in_reminder", shiftName: shift.name });
        }
      } else if (!user.checkedOut && shift.checkOutStart && shift.checkOutEnd) {
        const end = hhmmToMinutes(shift.checkOutEnd);
        if (!Number.isNaN(end) && withinLeadWindow(nowMinutes, end, REMINDER_LEAD_MINUTES)) {
          results.push({ userId: user.userId, kind: "check_out_reminder", shiftName: shift.name });
        }
      }
    }
  }

  return results;
}
