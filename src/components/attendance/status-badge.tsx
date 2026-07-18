import type { AttendanceStatus, AttendanceApproval } from "@/generated/prisma/enums";
import { ATTENDANCE_SWATCH, STATUS_LABEL, APPROVAL_LABEL, APPROVAL_BADGE } from "@/lib/attendance-ui";
import { cn } from "@/lib/utils";

/**
 * Attendance status chip — the same colors as the heatmap and legend.
 * `working` (checked in, not yet out) takes precedence over a null status and
 * shows a live "Working" chip with a pulsing dot.
 */
export function StatusBadge({
  status,
  working,
  className,
}: {
  status: AttendanceStatus | null;
  working?: boolean;
  className?: string;
}) {
  if (working && !status) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          className
        )}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        Working
      </span>
    );
  }
  if (!status) {
    return (
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", ATTENDANCE_SWATCH.NONE.badge, className)}>
        Pending
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        ATTENDANCE_SWATCH[status].badge,
        className
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ApprovalBadge({ approval, className }: { approval: AttendanceApproval; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", APPROVAL_BADGE[approval], className)}
    >
      {APPROVAL_LABEL[approval]}
    </span>
  );
}
