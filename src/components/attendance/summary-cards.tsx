import { cn } from "@/lib/utils";

export interface AttendanceSummaryData {
  present: number;
  halfDay: number;
  absent: number;
  pending: number;
  workingDays: number;
  attendancePercent: number;
}

/** The summary strip: Present / Half Days / Absent / Pending / Working Days / Attendance %. */
export function SummaryCards({ summary }: { summary: AttendanceSummaryData }) {
  const cards: { label: string; value: string; accent?: string }[] = [
    { label: "Present Days", value: String(summary.present), accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "Half Days", value: String(summary.halfDay), accent: "text-amber-600 dark:text-amber-400" },
    { label: "Absent Days", value: String(summary.absent), accent: "text-red-600 dark:text-red-400" },
    { label: "Pending", value: String(summary.pending), accent: "text-muted-foreground" },
    { label: "Working Days", value: String(summary.workingDays) },
    { label: "Attendance", value: `${summary.attendancePercent.toFixed(1)}%` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card/40 p-3">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", c.accent)}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}
