import type { LeaveRequest, User } from "@/generated/prisma/client";
import { keyFromDate } from "@/lib/attendance";

export const leaveRequestInclude = {
  user: { select: { id: true, name: true, surname: true, avatarDataUrl: true, department: { select: { name: true } } } },
  decidedBy: { select: { id: true, name: true, surname: true } },
} as const;

type WithRelations = LeaveRequest & {
  user: Pick<User, "id" | "name" | "surname" | "avatarDataUrl"> & { department: { name: string } | null };
  decidedBy: Pick<User, "id" | "name" | "surname"> | null;
};

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");

/** The wire shape: dates as "YYYY-MM-DD" keys (never shifted by a timezone), instants as ISO strings. */
export function serializeLeaveRequest(r: WithRelations) {
  return {
    id: r.id,
    category: r.category,
    startDate: keyFromDate(r.startDate),
    endDate: keyFromDate(r.endDate),
    isHalfDay: r.isHalfDay,
    days: r.days,
    reason: r.reason,
    status: r.status,
    appliedAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedByName: r.decidedBy ? fullName(r.decidedBy) : null,
    adminNote: r.adminNote,
    user: {
      id: r.user.id,
      name: fullName(r.user),
      avatarDataUrl: r.user.avatarDataUrl,
      department: r.user.department?.name ?? null,
    },
  };
}
