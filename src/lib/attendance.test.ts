import { describe, expect, it } from "vitest";
import {
  istDateKey,
  dateFromKey,
  keyFromDate,
  weekdayOfKey,
  hhmmToMinutes,
  withinWindow,
  computeWorkedMinutes,
  classifyStatus,
  isWorkingDay,
  summarize,
  DEFAULT_POLICY,
  type AttendancePolicy,
} from "./attendance";

describe("istDateKey", () => {
  it("labels an instant by its IST calendar day, not UTC's", () => {
    // 2026-07-24T20:00:00Z is 2026-07-25 01:30 IST — a different calendar day in UTC.
    expect(istDateKey(new Date("2026-07-24T20:00:00.000Z"))).toBe("2026-07-25");
  });

  it("a UTC-midnight instant that's still the same IST day as its own date", () => {
    expect(istDateKey(new Date("2026-07-25T00:00:00.000Z"))).toBe("2026-07-25");
  });
});

describe("dateFromKey / keyFromDate round-trip", () => {
  it("round-trips a key through a Date and back", () => {
    const key = "2026-07-25";
    const date = dateFromKey(key);
    expect(date.toISOString()).toBe("2026-07-25T00:00:00.000Z");
    expect(keyFromDate(date)).toBe(key);
  });
});

describe("weekdayOfKey", () => {
  it("returns JS getDay() for the calendar date, ignoring any timezone shift", () => {
    // 2026-07-25 is a Saturday.
    expect(weekdayOfKey("2026-07-25")).toBe(6);
  });
});

describe("hhmmToMinutes", () => {
  it("parses HH:mm into minutes past midnight", () => {
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("00:00")).toBe(0);
  });

  it("returns NaN for anything unparseable", () => {
    expect(Number.isNaN(hhmmToMinutes("garbage"))).toBe(true);
    expect(Number.isNaN(hhmmToMinutes(""))).toBe(true);
  });
});

describe("withinWindow", () => {
  it("checks an ordinary same-day window", () => {
    expect(withinWindow(600, "09:00", "11:00")).toBe(true); // 10:00
    expect(withinWindow(480, "09:00", "11:00")).toBe(false); // 08:00
  });

  it("supports a window that wraps past midnight", () => {
    expect(withinWindow(30, "22:00", "01:00")).toBe(true); // 00:30, wraps
    expect(withinWindow(600, "22:00", "01:00")).toBe(false); // 10:00, outside
  });

  it("doesn't block when the window is unconfigured (unparseable bounds)", () => {
    expect(withinWindow(600, "", "")).toBe(true);
  });
});

describe("computeWorkedMinutes", () => {
  it("computes whole minutes between check-in and check-out", () => {
    const checkIn = new Date("2026-07-25T04:00:00.000Z");
    const checkOut = new Date("2026-07-25T12:30:00.000Z");
    expect(computeWorkedMinutes(checkIn, checkOut)).toBe(510);
  });

  it("returns null if either side is missing", () => {
    expect(computeWorkedMinutes(null, new Date())).toBeNull();
    expect(computeWorkedMinutes(new Date(), null)).toBeNull();
  });

  it("clamps a negative duration (checkout before checkin) to 0 rather than going negative", () => {
    const checkIn = new Date("2026-07-25T12:00:00.000Z");
    const checkOut = new Date("2026-07-25T04:00:00.000Z");
    expect(computeWorkedMinutes(checkIn, checkOut)).toBe(0);
  });
});

describe("classifyStatus", () => {
  const policy: AttendancePolicy = { ...DEFAULT_POLICY, fullDayMinutes: 480, halfDayMinutes: 240 };

  it("classifies full attendance at or above the full-day threshold", () => {
    expect(classifyStatus(480, policy)).toBe("PRESENT");
    expect(classifyStatus(600, policy)).toBe("PRESENT");
  });

  it("classifies half day between the half and full thresholds", () => {
    expect(classifyStatus(240, policy)).toBe("HALF_DAY");
    expect(classifyStatus(479, policy)).toBe("HALF_DAY");
  });

  it("classifies absent below the half-day threshold", () => {
    expect(classifyStatus(0, policy)).toBe("ABSENT");
    expect(classifyStatus(239, policy)).toBe("ABSENT");
  });
});

describe("isWorkingDay", () => {
  const policy: AttendancePolicy = { ...DEFAULT_POLICY, workingWeekdays: [1, 2, 3, 4, 5, 6] }; // Mon-Sat

  it("a configured working weekday with no holiday is a working day", () => {
    expect(isWorkingDay("2026-07-25", policy, new Set())).toBe(true); // Saturday, in the set
  });

  it("a weekday not in the working set is not a working day", () => {
    expect(isWorkingDay("2026-07-26", policy, new Set())).toBe(false); // Sunday
  });

  it("an explicit holiday overrides an otherwise-working weekday", () => {
    expect(isWorkingDay("2026-07-25", policy, new Set(["2026-07-25"]))).toBe(false);
  });
});

describe("summarize", () => {
  it("counts PRESENT/HALF_DAY/ABSENT, tracks PENDING separately, and drops REJECTED", () => {
    const summary = summarize([
      { status: "PRESENT", approvalStatus: "APPROVED" },
      { status: "PRESENT", approvalStatus: "APPROVED" },
      { status: "HALF_DAY", approvalStatus: "APPROVED" },
      { status: "ABSENT", approvalStatus: "APPROVED" },
      { status: null, approvalStatus: "PENDING" },
      { status: "PRESENT", approvalStatus: "REJECTED" },
    ]);
    expect(summary).toEqual({
      present: 2,
      halfDay: 1,
      absent: 1,
      pending: 1,
      workingDays: 4,
      attendanceEquivalent: 2.5,
      attendancePercent: 62.5,
    });
  });

  it("returns 0% when there are no finalized working days", () => {
    const summary = summarize([{ status: null, approvalStatus: "PENDING" }]);
    expect(summary.workingDays).toBe(0);
    expect(summary.attendancePercent).toBe(0);
  });

  it("a record with a finalized status but still PENDING approval counts as pending, not its status", () => {
    const summary = summarize([{ status: "PRESENT", approvalStatus: "PENDING" }]);
    expect(summary.pending).toBe(1);
    expect(summary.present).toBe(0);
  });
});
