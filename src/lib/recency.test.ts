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
});
