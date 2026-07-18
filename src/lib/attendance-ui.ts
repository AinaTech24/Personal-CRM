import type { AttendanceStatus, AttendanceApproval, HalfDayReason } from "@/generated/prisma/enums";

/**
 * The single source of truth for attendance colors, so the heatmap, badges,
 * tables, legends and tooltips can never drift apart. Every consumer reads from
 * here rather than writing its own class strings.
 *
 *   Green  = Present / Full Day
 *   Amber  = Half Day
 *   Red    = Absent
 *   Blue   = Sunday / non-working day
 *   Neutral= future date or no finalized data (pending, checked-in-not-out)
 */
export type CellKind = AttendanceStatus | "SUNDAY" | "HOLIDAY" | "NONE";

interface Swatch {
  /** Solid fill for heatmap cells. */
  cell: string;
  /** Badge (soft bg + readable text) for tables and status chips. */
  badge: string;
  /** The legend/tooltip dot. */
  dot: string;
  label: string;
}

export const ATTENDANCE_SWATCH: Record<CellKind, Swatch> = {
  PRESENT: {
    cell: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    label: "Present",
  },
  HALF_DAY: {
    cell: "bg-amber-400",
    badge: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-400",
    label: "Half Day",
  },
  ABSENT: {
    cell: "bg-red-500",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400",
    dot: "bg-red-500",
    label: "Absent",
  },
  SUNDAY: {
    cell: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    label: "Sunday",
  },
  HOLIDAY: {
    cell: "bg-blue-500/60",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500/60",
    label: "Holiday",
  },
  NONE: {
    cell: "bg-muted",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
    label: "No data",
  },
};

/** The four states shown in the calendar legend, in order. */
export const LEGEND_ITEMS: CellKind[] = ["PRESENT", "HALF_DAY", "ABSENT", "SUNDAY"];

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  HALF_DAY: "Half Day",
  ABSENT: "Absent",
};

export const APPROVAL_LABEL: Record<AttendanceApproval, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const APPROVAL_BADGE: Record<AttendanceApproval, string> = {
  PENDING: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
  APPROVED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  REJECTED: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export const HALF_DAY_REASON_LABEL: Record<HalfDayReason, string> = {
  LATE_ARRIVAL: "Late Arrival",
  EARLY_DEPARTURE: "Early Departure",
  INSUFFICIENT_HOURS: "Insufficient Working Hours",
  APPROVED_HALF_DAY: "Approved Half Day",
  MANUAL_ADJUSTMENT: "Manual Adjustment",
  OTHER: "Other",
};

/** Minutes → "9h 00m". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** A UTC instant → "9:00 AM" in IST. */
export function formatIstTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

/** "2026-07-13" → "Monday, 13 July 2026" (the tooltip heading format). */
export function formatFullDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
