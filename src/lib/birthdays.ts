/**
 * Birthday maths on plain "YYYY-MM-DD" calendar keys (the app is IST-only; see
 * attendance.ts). Everything is evaluated as a calendar day in UTC, so the host's
 * timezone never shifts a birthday by a day.
 */

const DAY_MS = 86_400_000;

function isLeap(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The next occurrence (today included) of a month/day on or after `todayKey`. A Feb 29 birthday falls on Feb 28 in non-leap years. */
function nextOccurrence(month: number, day: number, todayKey: string): Date {
  const [ty] = todayKey.split("-").map(Number);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  for (const year of [ty, ty + 1]) {
    const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
    const candidate = new Date(Date.UTC(year, month - 1, d));
    if (candidate.getTime() >= today.getTime()) return candidate;
  }
  // Unreachable: next year's occurrence is always after today.
  return new Date(Date.UTC(ty + 1, month - 1, day));
}

export interface BirthdayInfo {
  month: number;
  day: number;
  /** 0 = today. */
  daysUntil: number;
  /** The age they turn on the next occurrence. */
  turning: number;
  /** The calendar year that next occurrence falls in. */
  year: number;
}

/** Month/day of a stored "YYYY-MM-DD" birthday, and how far away the next one is. */
export function birthdayInfo(birthdayKey: string, todayKey: string): BirthdayInfo {
  const [by, month, day] = birthdayKey.split("-").map(Number);
  const next = nextOccurrence(month, day, todayKey);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  return {
    month,
    day,
    daysUntil: Math.round((next.getTime() - today.getTime()) / DAY_MS),
    turning: next.getUTCFullYear() - by,
    year: next.getUTCFullYear(),
  };
}

/** Suggested gifts in the admin dropdown; the stored gift is free text, so an admin can type anything else. */
export const BIRTHDAY_GIFTS = ["Hamper", "Cake", "Plant"] as const;

export const MAX_GIFT_LENGTH = 100;

/** The wish shown to the whole company on someone's birthday, with their gift if an admin chose one. */
export function birthdayWish(name: string, gift?: string | null): string {
  const base = `Happy Birthday, ${name}! 🎂 Wishing you a day full of joy and a year full of success, from all of us in the Aina Family.`;
  return gift ? `${base} 🎁 Your gift: ${gift}!` : base;
}

/** The calendar date a birthday fell on in `year` as "YYYY-MM-DD" (a Feb 29 birthday is kept on Feb 28 in non-leap years). */
export function birthdayDateInYear(month: number, day: number, year: number): string {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const d = month === 2 && day === 29 && !leap ? 28 : day;
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
