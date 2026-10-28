import { differenceInCalendarDays, differenceInCalendarWeeks, differenceInCalendarMonths, differenceInCalendarYears } from "date-fns";

export interface RecencyLabel {
  text: string;
  /** "New" (created today) gets its own highlighted badge color; every older bucket shares the plain one. */
  isNew: boolean;
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * A human-friendly age for `createdAt`, from "New" (today) down through
 * years — "Yesterday", then "N days ago" up to a week, "N weeks ago" up to
 * a month, "N months ago" up to a year, "N years ago" beyond that. Purely a
 * function of `now` vs. `createdAt` — nothing is stored or expired, so the
 * label keeps advancing on its own as time passes. Returns null only for a
 * bad or future createdAt, which should never happen for a real record.
 */
export function recencyLabel(createdAt: string | Date, now: Date = new Date()): RecencyLabel | null {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  if (Number.isNaN(created.getTime())) return null;

  const days = differenceInCalendarDays(now, created);
  if (days < 0) return null;
  if (days === 0) return { text: "New", isNew: true };
  if (days === 1) return { text: "Yesterday", isNew: false };
  if (days < 7) return { text: plural(days, "day"), isNew: false };

  const weeks = differenceInCalendarWeeks(now, created, { weekStartsOn: 1 });
  if (weeks < 5) return { text: plural(weeks, "week"), isNew: false };

  const months = differenceInCalendarMonths(now, created);
  if (months < 12) return { text: plural(months, "month"), isNew: false };

  const years = differenceInCalendarYears(now, created);
  return { text: plural(years, "year"), isNew: false };
}
