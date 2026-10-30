import { describe, expect, it } from "vitest";
import { recencyLabel } from "./recency";

const NOW = new Date("2026-10-28T12:00:00Z");

describe("recencyLabel", () => {
  it("is New on the same calendar day", () => {
    expect(recencyLabel("2026-10-28T06:30:00Z", NOW)).toMatchObject({ text: "New", isNew: true });
  });

  it("is Yesterday the calendar day before", () => {
    expect(recencyLabel("2026-10-27T12:00:00Z", NOW)).toMatchObject({ text: "Yesterday", isNew: false });
  });

  it("counts single-digit days", () => {
    expect(recencyLabel("2026-10-25T12:00:00Z", NOW)).toMatchObject({ text: "3 days ago", isNew: false });
  });

  it("switches to weeks after a week", () => {
    expect(recencyLabel("2026-10-14T12:00:00Z", NOW)).toMatchObject({ text: "2 weeks ago", isNew: false });
  });

  it("uses singular units", () => {
    expect(recencyLabel("2026-10-20T12:00:00Z", NOW)).toMatchObject({ text: "1 week ago", isNew: false });
  });

  it("switches to months after about a month", () => {
    expect(recencyLabel("2026-08-28T12:00:00Z", NOW)).toMatchObject({ text: "2 months ago", isNew: false });
  });

  it("switches to years after a year", () => {
    expect(recencyLabel("2024-10-28T12:00:00Z", NOW)).toMatchObject({ text: "2 years ago", isNew: false });
  });

  it("returns null for a future date", () => {
    expect(recencyLabel("2026-10-29T12:00:00Z", NOW)).toBeNull();
  });

  it("returns null for an invalid date", () => {
    expect(recencyLabel("not-a-date", NOW)).toBeNull();
  });

  // Both of these sit in the +5:30-wide band where the UTC calendar day and
  // the IST calendar day disagree — exactly the case that silently depended
  // on the server process's own timezone before istShift was wired in. The
  // test runner's own TZ is whatever CI/the OS happens to default to (not
  // IST), so these only pass if the function computes the IST day itself.
  it("counts an IST-day boundary crossed mid-UTC-day as a day apart", () => {
    // now: 2026-10-28T19:00Z = 2026-10-29 00:30 IST (IST day: 29th)
    // created: 2026-10-28T10:00Z = 2026-10-28 15:30 IST (IST day: 28th)
    // Same UTC calendar day for both — a day apart only in IST.
    const now = new Date("2026-10-28T19:00:00Z");
    expect(recencyLabel("2026-10-28T10:00:00Z", now)).toMatchObject({ text: "Yesterday", isNew: false });
  });

  it("stays New across a UTC midnight that the IST day hasn't crossed yet", () => {
    // now: 2026-10-28T19:00Z = 2026-10-29 00:30 IST
    // created: 2026-10-28T18:45Z = 2026-10-29 00:15 IST — same IST day,
    // despite both falling on 2026-10-28 in UTC terms either way.
    const now = new Date("2026-10-28T19:00:00Z");
    expect(recencyLabel("2026-10-28T18:45:00Z", now)).toMatchObject({ text: "New", isNew: true });
  });
});
