import { describe, expect, it } from "vitest";
import { parseWorkingWeekdays, workingDayKeys } from "./leave-calendar";

const MON_SAT = [1, 2, 3, 4, 5, 6];

describe("workingDayKeys", () => {
  it("skips Sundays", () => {
    // 2026-10-10 is a Saturday, 2026-10-11 a Sunday.
    expect(workingDayKeys("2026-10-10", "2026-10-12", MON_SAT, new Set())).toEqual(["2026-10-10", "2026-10-12"]);
  });

  it("skips holidays", () => {
    expect(workingDayKeys("2026-10-12", "2026-10-14", MON_SAT, new Set(["2026-10-13"]))).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("returns one key for a single day", () => {
    expect(workingDayKeys("2026-10-12", "2026-10-12", MON_SAT, new Set())).toEqual(["2026-10-12"]);
  });

  it("is empty when the range is only non-working days", () => {
    expect(workingDayKeys("2026-10-11", "2026-10-11", MON_SAT, new Set())).toEqual([]);
  });
});

describe("parseWorkingWeekdays", () => {
  it("parses the stored csv", () => expect(parseWorkingWeekdays("1,2,3")).toEqual([1, 2, 3]));
  it("falls back to Mon–Sat on junk", () => expect(parseWorkingWeekdays("x,,9")).toEqual(MON_SAT));
});
