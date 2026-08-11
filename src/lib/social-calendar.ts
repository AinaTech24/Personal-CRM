import { addDays, startOfWeek } from "date-fns";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Pure, framework-free Content Calendar helpers shared between the calendar
 * grid (client-detail-view.tsx) and the Content Reports PDF generator
 * (content-reports-tab.tsx) — no React or Tailwind classes in here, just the
 * date/data logic both need to stay in sync.
 */

export type CalendarWeekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
export type CalendarSlotStatus = "NOT_UPLOADED" | "PENDING" | "DONE";
export type CalendarContentType = "STATIC_POST" | "CAROUSEL" | "AI_REEL" | "REAL_PERSON_REEL";

export interface CalendarSlot {
  id: string;
  clientId: string;
  year: number;
  month: number;
  week: number;
  weekday: CalendarWeekday;
  contentType: CalendarContentType | null;
  note: string | null;
  manualNumber: number | null;
  status: CalendarSlotStatus;
}

export const CALENDAR_WEEKDAYS: CalendarWeekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export const CALENDAR_WEEKDAY_LABELS: Record<CalendarWeekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/** AI and real-person reels share one "Reel" bucket for display/numbering — the doc's deliverables count them together. */
export const CALENDAR_DISPLAY_GROUP: Record<CalendarContentType, string> = {
  STATIC_POST: "Static",
  CAROUSEL: "Carousel",
  AI_REEL: "Reel",
  REAL_PERSON_REEL: "Reel",
};

/** Full type names, not merged — used wherever the Reel/AI-vs-real-person distinction matters (e.g. reports). */
export const CALENDAR_CONTENT_TYPE_LABELS: Record<CalendarContentType, string> = {
  STATIC_POST: "Static Post",
  CAROUSEL: "Carousel",
  AI_REEL: "AI Reel",
  REAL_PERSON_REEL: "Real Person Reel",
};

export const CALENDAR_STATUS_LABELS: Record<CalendarSlotStatus, string> = {
  DONE: "Completed / Uploaded",
  PENDING: "Pending",
  NOT_UPLOADED: "Not Uploaded",
};

/** The grid is always this many rows — the most any month ever needs — so the table's height never changes between months. */
export const CALENDAR_GRID_WEEKS = 6;

export function calendarSlotKey(week: number, weekday: string) {
  return `${week}-${weekday}`;
}

/**
 * A real Monday–Sunday calendar grid for the given month — always a fixed 6
 * rows. Week 1's Monday is the Monday on/before the 1st. A month that only
 * needs 4 or 5 weeks simply spills further into the next month on the
 * trailing rows — same as Week 1 spilling into the previous month at the top.
 */
export function monthGridDates(year: number, month: number): Date[][] {
  const gridStart = startOfWeek(new Date(year, month - 1, 1), { weekStartsOn: 1 });
  return Array.from({ length: CALENDAR_GRID_WEEKS }, (_, week) =>
    Array.from({ length: 7 }, (_, weekdayIndex) => addDays(gridStart, week * 7 + weekdayIndex))
  );
}

/**
 * Display label for a slot — "Static - 3", "Reel - 1", a freeform note, or
 * null for an empty cell. A slot with manualNumber set uses that number
 * directly; slots left on "Auto" get the next sequential position among
 * only the other auto-numbered slots of the same type.
 */
export function calendarLabelsFor(slots: CalendarSlot[]): Map<string, string> {
  const ordered = [...slots].sort((a, b) => a.week - b.week || CALENDAR_WEEKDAYS.indexOf(a.weekday) - CALENDAR_WEEKDAYS.indexOf(b.weekday));
  const counts: Record<string, number> = {};
  const result = new Map<string, string>();
  for (const s of ordered) {
    if (s.contentType) {
      const group = CALENDAR_DISPLAY_GROUP[s.contentType];
      let n: number;
      if (s.manualNumber) {
        n = s.manualNumber;
      } else {
        counts[group] = (counts[group] ?? 0) + 1;
        n = counts[group];
      }
      result.set(s.id, `${group} - ${n}`);
    } else if (s.note) {
      result.set(s.id, s.note);
    }
  }
  return result;
}

/**
 * Maps every real calendar day of a month (1..daysInMonth) onto its
 * (week, weekday) grid cell — the same Monday-anchored grid monthGridDates
 * produces — plus whatever slot lives there, for a day-by-day report. Only
 * days that actually belong to the month are included (no leading/trailing
 * spillover), even though those spillover cells exist and are addressable in
 * the grid itself.
 */
export function calendarDaysForMonth(
  year: number,
  month: number,
  slots: CalendarSlot[]
): { date: Date; week: number; weekday: CalendarWeekday; slot: CalendarSlot | null }[] {
  const gridStart = startOfWeek(new Date(year, month - 1, 1), { weekStartsOn: 1 });
  const byKey = new Map(slots.map((s) => [calendarSlotKey(s.week, s.weekday), s]));
  const daysInMonth = new Date(year, month, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    const offset = Math.round((date.getTime() - gridStart.getTime()) / 86_400_000);
    const week = Math.floor(offset / 7) + 1;
    const weekday = CALENDAR_WEEKDAYS[offset % 7];
    return { date, week, weekday, slot: byKey.get(calendarSlotKey(week, weekday)) ?? null };
  });
}
