import { differenceInCalendarDays, differenceInCalendarWeeks, differenceInCalendarMonths, differenceInCalendarYears } from "date-fns";
import { istShift } from "@/lib/attendance";

export interface RecencyLabel {
  text: string;
  /** "New" (created today) gets its own highlighted badge color; every older bucket shares the plain one. */
  isNew: boolean;
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * `instant`'s IST calendar date (year/month/day), re-packed into a Date
 * constructed from those fields rather than `instant` itself. date-fns'
 * `differenceInCalendar*` functions read a Date's *local* Y/M/D — on a
 * server whose own process timezone isn't IST (any local dev machine, or
 * production if the one-time `timedatectl set-timezone Asia/Kolkata` step
 * is ever missed on a redeploy), calling them on `instant` directly would
 * silently use the wrong calendar day. Building a fresh Date from the
 * IST-shifted Y/M/D instead means the same local Y/M/D goes in as comes back
 * out, however `differenceInCalendar*` reads it — correct regardless of the
 * server's own timezone.
 */
function istCalendarDate(instant: Date): Date {
  const shifted = istShift(instant);
  return new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
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

  const todayIst = istCalendarDate(now);
  const createdIst = istCalendarDate(created);

  const days = differenceInCalendarDays(todayIst, createdIst);
  if (days < 0) return null;
  if (days === 0) return { text: "New", isNew: true };
  if (days === 1) return { text: "Yesterday", isNew: false };
  if (days < 7) return { text: plural(days, "day"), isNew: false };

  const weeks = differenceInCalendarWeeks(todayIst, createdIst, { weekStartsOn: 1 });
  if (weeks < 5) return { text: plural(weeks, "week"), isNew: false };

  const months = differenceInCalendarMonths(todayIst, createdIst);
  if (months < 12) return { text: plural(months, "month"), isNew: false };

  const years = differenceInCalendarYears(todayIst, createdIst);
  return { text: plural(years, "year"), isNew: false };
}
