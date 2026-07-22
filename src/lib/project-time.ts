/**
 * Time-tracking arithmetic for projects.
 *
 * Pure functions shared by the API and the workspace UI so a total shown on
 * screen is produced by the same code that a report would use.
 *
 * Two conventions hold throughout:
 *
 * - **Minutes are the unit.** Durations are summed as integer minutes and only
 *   converted to hours for display. Summing decimal hours drifts: 20 minutes is
 *   0.333… hours, and a hundred of those is visibly wrong.
 * - **Dates are keyed by their UTC calendar day.** `workDate` is a `@db.Date`,
 *   which Prisma hands back as midnight UTC. Reading it through the local
 *   timezone would shift every entry a day backwards anywhere west of UTC, so
 *   the day key is taken from the ISO string rather than from `getDate()`.
 */

export interface TimeEntryLike {
  id: string;
  workDate: string;
  minutes: number;
  description: string | null;
  user: { id: string; name: string; surname?: string | null; avatarDataUrl?: string | null };
}

/** `2026-07-22` — the calendar day an entry belongs to. */
export function dayKey(workDate: string): string {
  return workDate.slice(0, 10);
}

/** Midday UTC, so formatting the key in a local timezone can't roll it over. */
export function dayKeyToDate(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/**
 * `7h 30m`. Hours are not rounded to decimals — "7.5h" reads as a measurement
 * when it's actually an exact count of minutes.
 */
export function formatDuration(minutes: number): string {
  if (!minutes) return "0h";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (!h) return `${sign}${m}m`;
  if (!m) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** Decimal hours, for chart axes and anywhere a number has to be plotted. */
export function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export interface PersonTotal {
  user: TimeEntryLike["user"];
  minutes: number;
  /** Calendar days this person logged anything on. */
  daysWorked: number;
  entries: number;
  /** Their share of the project's logged time, 0–100. */
  sharePct: number;
}

export interface DayPoint {
  key: string;
  date: Date;
  minutes: number;
  entries: number;
}

export interface TimeSummary {
  totalMinutes: number;
  /** Distinct calendar days with at least one entry. */
  daysWorked: number;
  /**
   * Calendar days from the first logged day to the last, inclusive — including
   * days nobody worked. Elapsed time, not effort.
   */
  elapsedDays: number;
  /** Mean minutes across `daysWorked` — days with no entries are excluded. */
  avgMinutesPerDay: number;
  /** Longest run of consecutive calendar days with time logged. */
  longestStreak: number;
  firstDay: string | null;
  lastDay: string | null;
  entryCount: number;
  contributorCount: number;
}

/**
 * Per-person totals, largest first.
 *
 * `sharePct` is computed against the project total, so the column sums to 100
 * (give or take one point of rounding) rather than to something arbitrary.
 */
export function summariseByPerson(entries: TimeEntryLike[]): PersonTotal[] {
  const total = entries.reduce((sum, e) => sum + e.minutes, 0);
  const byUser = new Map<string, { user: TimeEntryLike["user"]; minutes: number; days: Set<string>; entries: number }>();

  for (const entry of entries) {
    const found = byUser.get(entry.user.id) ?? {
      user: entry.user,
      minutes: 0,
      days: new Set<string>(),
      entries: 0,
    };
    found.minutes += entry.minutes;
    found.days.add(dayKey(entry.workDate));
    found.entries += 1;
    byUser.set(entry.user.id, found);
  }

  return [...byUser.values()]
    .map((r) => ({
      user: r.user,
      minutes: r.minutes,
      daysWorked: r.days.size,
      entries: r.entries,
      sharePct: total ? Math.round((r.minutes / total) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * One point per calendar day from the first entry to the last, with zero-filled
 * gaps.
 *
 * The gaps matter: a line drawn only through days that have entries implies
 * steady work across a fortnight when the truth was two bursts. Zero-filling
 * makes idle stretches visible as troughs.
 */
export function buildDailySeries(entries: TimeEntryLike[]): DayPoint[] {
  if (entries.length === 0) return [];

  const byDay = new Map<string, { minutes: number; entries: number }>();
  for (const entry of entries) {
    const key = dayKey(entry.workDate);
    const found = byDay.get(key) ?? { minutes: 0, entries: 0 };
    found.minutes += entry.minutes;
    found.entries += 1;
    byDay.set(key, found);
  }

  const keys = [...byDay.keys()].sort();
  const first = dayKeyToDate(keys[0]);
  const last = dayKeyToDate(keys[keys.length - 1]);

  const points: DayPoint[] = [];
  // Step in UTC so a DST boundary can't produce a duplicate or missing day.
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    points.push({ key, date: dayKeyToDate(key), minutes: hit?.minutes ?? 0, entries: hit?.entries ?? 0 });
  }
  return points;
}

/** Longest run of consecutive days that each have time logged. */
function longestStreakOf(dayKeys: string[]): number {
  if (dayKeys.length === 0) return 0;
  const sorted = [...new Set(dayKeys)].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = dayKeyToDate(sorted[i - 1]);
    const curr = dayKeyToDate(sorted[i]);
    const gapDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    run = gapDays === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export function summariseTime(entries: TimeEntryLike[]): TimeSummary {
  if (entries.length === 0) {
    return {
      totalMinutes: 0,
      daysWorked: 0,
      elapsedDays: 0,
      avgMinutesPerDay: 0,
      longestStreak: 0,
      firstDay: null,
      lastDay: null,
      entryCount: 0,
      contributorCount: 0,
    };
  }

  const keys = entries.map((e) => dayKey(e.workDate));
  const distinct = [...new Set(keys)].sort();
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const first = distinct[0];
  const last = distinct[distinct.length - 1];
  const spanMs = dayKeyToDate(last).getTime() - dayKeyToDate(first).getTime();

  return {
    totalMinutes,
    daysWorked: distinct.length,
    // +1 so a project worked on for a single day reads as 1 elapsed day, not 0.
    elapsedDays: Math.round(spanMs / 86_400_000) + 1,
    avgMinutesPerDay: Math.round(totalMinutes / distinct.length),
    longestStreak: longestStreakOf(keys),
    firstDay: first,
    lastDay: last,
    entryCount: entries.length,
    contributorCount: new Set(entries.map((e) => e.user.id)).size,
  };
}

/**
 * Progress against the budgeted hours, or null when the project has no
 * estimate. Deliberately uncapped: 130% is the number worth seeing.
 */
export function budgetUsage(totalMinutes: number, estimatedHours: number | null | undefined) {
  if (!estimatedHours || estimatedHours <= 0) return null;
  const budgetMinutes = estimatedHours * 60;
  return {
    budgetMinutes,
    usedPct: Math.round((totalMinutes / budgetMinutes) * 100),
    remainingMinutes: budgetMinutes - totalMinutes,
    over: totalMinutes > budgetMinutes,
  };
}
