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
export function withinLeadWindow(nowMinutes: number, endMinutes: number, leadMinutes: number): boolean {
  const start = (endMinutes - leadMinutes + 1440) % 1440;
  return start <= endMinutes ? nowMinutes >= start && nowMinutes <= endMinutes : nowMinutes >= start || nowMinutes <= endMinutes;
}

/**
 * Who needs a check-in or check-out nudge right now, and for which shift.
 *
 * Pure and DB-free by design — the route does all the fetching and hands in
 * plain state, so this stays unit-testable without a database. Only fires in
 * the last few minutes of a window, not the instant it opens — a reminder
 * should mean "don't forget, it's closing soon," not "you may act now"
 * (check-in/check-out already tell you that when you try). Check-in and
 * check-out can use different lead times — e.g. check-in only right at
 * 9:30 rather than the full REMINDER_LEAD_MINUTES ahead of it — both default
 * to REMINDER_LEAD_MINUTES when omitted.
 */
export function computeReminders(
  shifts: AttendanceShift[],
  users: ReminderUserState[],
  nowMinutes: number,
  opts: { checkInLeadMinutes?: number; checkOutLeadMinutes?: number } = {}
): ReminderCandidate[] {
  const checkInLead = opts.checkInLeadMinutes ?? REMINDER_LEAD_MINUTES;
  const checkOutLead = opts.checkOutLeadMinutes ?? REMINDER_LEAD_MINUTES;
  const results: ReminderCandidate[] = [];

  for (const user of users) {
    if (user.leaveType === "FULL_DAY") continue;
    const allowedTypes: AttendanceShift["type"][] = user.leaveType === "HALF_DAY" ? ["HALF_DAY"] : ["FULL_DAY", "HALF_DAY"];

    for (const shift of shifts) {
      if (!allowedTypes.includes(shift.type)) continue;

      if (!user.checkedIn) {
        const end = hhmmToMinutes(shift.checkInEnd);
        if (!Number.isNaN(end) && withinLeadWindow(nowMinutes, end, checkInLead)) {
          results.push({ userId: user.userId, kind: "check_in_reminder", shiftName: shift.name });
        }
      } else if (!user.checkedOut && shift.checkOutStart && shift.checkOutEnd) {
        const end = hhmmToMinutes(shift.checkOutEnd);
        if (!Number.isNaN(end) && withinLeadWindow(nowMinutes, end, checkOutLead)) {
          results.push({ userId: user.userId, kind: "check_out_reminder", shiftName: shift.name });
        }
      }
    }
  }

  return results;
}

/** Fixed daily lunch-break nudge time and how far ahead of it to fire — 15 min, i.e. 12:45 for a 1:00 lunch. */
export const LUNCH_REMINDER_TIME = "13:00";
export const LUNCH_REMINDER_LEAD_MINUTES = 15;

export interface LunchReminderUserState {
  userId: string;
  checkedIn: boolean;
  checkedOut: boolean;
  /** Already on a break right now — no need to tell them to take one. */
  onBreak: boolean;
}

/**
 * Who should be nudged to take their lunch break right now: anyone
 * currently at work (checked in, not out, not already on a break) within
 * the lead window before LUNCH_REMINDER_TIME. Unlike check-in/out this
 * isn't per-shift — one fixed company-wide time, same "nudge, never an
 * enforcement rule" reasoning as the shift windows above.
 */
export function computeLunchReminders(
  users: LunchReminderUserState[],
  nowMinutes: number,
  opts: { time?: string; leadMinutes?: number } = {}
): string[] {
  const end = hhmmToMinutes(opts.time ?? LUNCH_REMINDER_TIME);
  const lead = opts.leadMinutes ?? LUNCH_REMINDER_LEAD_MINUTES;
  if (Number.isNaN(end) || !withinLeadWindow(nowMinutes, end, lead)) return [];
  return users.filter((u) => u.checkedIn && !u.checkedOut && !u.onBreak).map((u) => u.userId);
}
