import type { AttendanceStatus, AttendanceApproval } from "@/generated/prisma/enums";
import { ATTENDANCE_SWATCH, STATUS_LABEL, APPROVAL_LABEL, APPROVAL_BADGE } from "@/lib/attendance-ui";
import { cn } from "@/lib/utils";

/** Attendance status chip — the same colors as the heatmap and legend. */
export function StatusBadge({ status, className }: { status: AttendanceStatus | null; className?: string }) {
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
