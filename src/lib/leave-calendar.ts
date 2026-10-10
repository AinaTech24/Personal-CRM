import { dateFromKey } from "@/lib/attendance";

/**
 * The working days between two "YYYY-MM-DD" keys (inclusive): days whose weekday
 * is in `workingWeekdays` (JS getDay, 0=Sun) and which aren't a holiday. These
 * are the days a leave actually takes someone out of work, so they're both what
 * the request counts as its duration and what gets written to attendance.
 */
export function workingDayKeys(startKey: string, endKey: string, workingWeekdays: number[], holidayKeys: Set<string>): string[] {
  const keys: string[] = [];
  const end = dateFromKey(endKey).getTime();
  for (let t = dateFromKey(startKey).getTime(); t <= end; t += 86_400_000) {
    const d = new Date(t);
    const key = d.toISOString().slice(0, 10);
    if (workingWeekdays.includes(d.getUTCDay()) && !holidayKeys.has(key)) keys.push(key);
  }
  return keys;
}

export function parseWorkingWeekdays(csv: string | null | undefined): number[] {
  const parsed = (csv ?? "1,2,3,4,5,6")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return parsed.length > 0 ? parsed : [1, 2, 3, 4, 5, 6];
}
