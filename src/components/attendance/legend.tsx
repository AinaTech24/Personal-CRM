import { ATTENDANCE_SWATCH, LEGEND_ITEMS } from "@/lib/attendance-ui";
import { cn } from "@/lib/utils";

/** The calendar legend: ■ Present  ■ Half Day  ■ Absent  ■ Sunday */
export function AttendanceLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {LEGEND_ITEMS.map((kind) => (
        <div key={kind} className="flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-sm", ATTENDANCE_SWATCH[kind].cell)} />
          <span className="text-xs text-muted-foreground">{ATTENDANCE_SWATCH[kind].label}</span>
        </div>
      ))}
    </div>
  );
}
