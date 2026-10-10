import { describe, expect, it } from "vitest";
import { birthdayInfo, birthdayWish } from "./birthdays";

describe("birthdayInfo", () => {
  it("is 0 days away on the birthday itself", () => {
    expect(birthdayInfo("1995-10-10", "2026-10-10")).toMatchObject({ daysUntil: 0, turning: 31, month: 10, day: 10 });
  });

  it("counts forward within the year", () => {
    expect(birthdayInfo("1990-10-15", "2026-10-10").daysUntil).toBe(5);
  });

  it("wraps to next year once the birthday has passed", () => {
    const info = birthdayInfo("1990-10-09", "2026-10-10");
    expect(info.daysUntil).toBe(364);
    expect(info.turning).toBe(37);
  });

  it("celebrates Feb 29 birthdays on Feb 28 in non-leap years", () => {
    expect(birthdayInfo("2000-02-29", "2027-02-28").daysUntil).toBe(0);
    expect(birthdayInfo("2000-02-29", "2028-02-29").daysUntil).toBe(0);
  });
});

describe("gifts", () => {
  it("reports the year the next birthday falls in", () => {
    expect(birthdayInfo("1990-10-09", "2026-10-10").year).toBe(2027);
    expect(birthdayInfo("1990-10-15", "2026-10-10").year).toBe(2026);
  });

  it("mentions the gift in the wish only when there is one", () => {
    expect(birthdayWish("Asha", "CAKE")).toContain("A cake is coming your way");
    expect(birthdayWish("Asha")).not.toContain("🎁");
  });
});
