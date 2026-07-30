import { describe, expect, it } from "vitest";
import { computeReminders, REMINDER_LEAD_MINUTES, type ReminderUserState } from "./attendance-reminders";
import type { AttendanceShift } from "./attendance";

const FULL_DAY_SHIFT: AttendanceShift = {
  name: "Full day",
  type: "FULL_DAY",
  checkInStart: "09:00",
  checkInEnd: "10:00",
  checkOutStart: "18:00",
  checkOutEnd: "19:00",
};

const HALF_DAY_SHIFT: AttendanceShift = {
  name: "Half day",
  type: "HALF_DAY",
  checkInStart: "09:00",
  checkInEnd: "10:00",
  checkOutStart: "13:00",
  checkOutEnd: "14:00",
};

function user(overrides: Partial<ReminderUserState> = {}): ReminderUserState {
  return { userId: "u1", leaveType: null, checkedIn: false, checkedOut: false, ...overrides };
}

describe("computeReminders — check-in", () => {
  it("fires within the lead window before checkInEnd when not yet checked in", () => {
    const nowMinutes = 10 * 60 - REMINDER_LEAD_MINUTES / 2; // 9:45, checkInEnd is 10:00
    const result = computeReminders([FULL_DAY_SHIFT], [user()], nowMinutes);
    expect(result).toEqual([{ userId: "u1", kind: "check_in_reminder", shiftName: "Full day" }]);
  });

  it("does not fire well before the lead window opens", () => {
    const nowMinutes = 9 * 60; // 9:00 — an hour before checkInEnd, outside the 30-min lead
    const result = computeReminders([FULL_DAY_SHIFT], [user()], nowMinutes);
    expect(result).toEqual([]);
  });

  it("does not fire once already checked in", () => {
    const nowMinutes = 10 * 60 - 10;
    const result = computeReminders([FULL_DAY_SHIFT], [user({ checkedIn: true })], nowMinutes);
    expect(result).toEqual([]);
  });

  it("does not fire for someone on full-day leave", () => {
    const nowMinutes = 10 * 60 - 10;
    const result = computeReminders([FULL_DAY_SHIFT], [user({ leaveType: "FULL_DAY" })], nowMinutes);
    expect(result).toEqual([]);
  });

  it("on half-day leave, only considers HALF_DAY shifts", () => {
    const nowMinutes = 10 * 60 - 10; // both shifts' checkInEnd is 10:00
    const result = computeReminders([FULL_DAY_SHIFT, HALF_DAY_SHIFT], [user({ leaveType: "HALF_DAY" })], nowMinutes);
    expect(result).toEqual([{ userId: "u1", kind: "check_in_reminder", shiftName: "Half day" }]);
  });
});

describe("computeReminders — check-out", () => {
  it("fires within the lead window before checkOutEnd when checked in but not out", () => {
    const nowMinutes = 19 * 60 - 10; // checkOutEnd is 19:00
    const result = computeReminders([FULL_DAY_SHIFT], [user({ checkedIn: true })], nowMinutes);
    expect(result).toEqual([{ userId: "u1", kind: "check_out_reminder", shiftName: "Full day" }]);
  });

  it("does not fire once already checked out", () => {
    const nowMinutes = 19 * 60 - 10;
    const result = computeReminders([FULL_DAY_SHIFT], [user({ checkedIn: true, checkedOut: true })], nowMinutes);
    expect(result).toEqual([]);
  });

  it("does not fire if never checked in at all (nothing to check out of)", () => {
    const nowMinutes = 19 * 60 - 10;
    const result = computeReminders([FULL_DAY_SHIFT], [user()], nowMinutes);
    expect(result).toEqual([]);
  });
});

describe("computeReminders — multiple users and shifts", () => {
  it("evaluates every user against every eligible shift independently", () => {
    const nowMinutes = 10 * 60 - 10;
    const users = [user({ userId: "a" }), user({ userId: "b", checkedIn: true })];
    const result = computeReminders([FULL_DAY_SHIFT], users, nowMinutes);
    expect(result).toEqual([{ userId: "a", kind: "check_in_reminder", shiftName: "Full day" }]);
  });
});
