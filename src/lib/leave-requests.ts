import type { LeaveRequest, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import { keyFromDate } from "@/lib/attendance";
import { grantLeaveDay, leaveWorkingDays } from "@/lib/leave";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

export const CATEGORY_LABEL: Record<string, string> = { CASUAL: "Casual", SICK: "Sick", EARNED: "Earned", UNPAID: "Unpaid", OTHER: "Other" };

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

/* ------------------------------- Trash ------------------------------- */

/** The requester themselves (removing their own history), or an admin/LEAVE grantee for the requester's department. */
export async function canDeleteLeaveRequest(user: PermissionUser, request: { userId: string; user: { departmentId: string | null } }): Promise<boolean> {
  if (request.userId === user.id) return true;
  const scope = await moduleAccessScope(user, "LEAVE", "DELETE");
  return scope === "all" || (scope !== null && request.user.departmentId === scope.departmentId);
}

/** Every trashed leave request this user is allowed to manage — their own, plus whatever their admin/grant scope covers. */
export async function listTrashedLeaveRequestsFor(user: PermissionUser): Promise<TrashItem[]> {
  const scope = await moduleAccessScope(user, "LEAVE", "DELETE");
  const where =
    scope === "all"
      ? { deletedAt: { not: null } }
      : {
          deletedAt: { not: null },
          OR: [{ userId: user.id }, ...(scope ? [{ user: { departmentId: scope.departmentId } }] : [])],
        };

  const requests = await db.leaveRequest.findMany({
    where,
    include: { user: { select: { id: true, name: true, surname: true } }, deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return requests.map((r) => ({
    id: r.id,
    module: "leaveRequests",
    moduleLabel: "Leave Requests",
    title: `${fullName(r.user)}'s ${CATEGORY_LABEL[r.category].toLowerCase()} leave`,
    subtitle: `${keyFromDate(r.startDate)} – ${keyFromDate(r.endDate)}`,
    deletedAt: r.deletedAt!.toISOString(),
    deletedBy: r.deletedBy,
    expiresAt: trashExpiresAt(r.deletedAt!).toISOString(),
  }));
}

/**
 * Clears the trash flag, putting the request back exactly as it was —
 * including re-stamping attendance for an already-approved request, since
 * deleting one undoes that stamp first (see the live DELETE route).
 */
export async function restoreLeaveRequest(user: PermissionUser, requestId: string): Promise<TrashActionResult> {
  const request = await db.leaveRequest.findUnique({ where: { id: requestId }, include: { user: { select: { departmentId: true } } } });
  if (!request || !request.deletedAt) return "not_found";
  if (!(await canDeleteLeaveRequest(user, request))) return "forbidden";

  await db.leaveRequest.update({ where: { id: requestId }, data: { deletedAt: null, deletedById: null } });

  if (request.status === "APPROVED") {
    const days = await leaveWorkingDays(keyFromDate(request.startDate), keyFromDate(request.endDate));
    const reason = `${CATEGORY_LABEL[request.category]} leave: ${request.reason}`.slice(0, 300);
    // Each day is its own independent upsert (keyed by userId+date), so these
    // can run in parallel instead of paying one round-trip pair per day.
    await Promise.all(
      days.map((key) =>
        grantLeaveDay({ userId: request.userId, dateKey: key, type: request.isHalfDay ? "HALF_DAY" : "FULL_DAY", reason, actorId: user.id })
      )
    );
  }

  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeLeaveRequest(user: PermissionUser, requestId: string): Promise<TrashActionResult> {
  const request = await db.leaveRequest.findUnique({ where: { id: requestId }, include: { user: { select: { departmentId: true } } } });
  if (!request || !request.deletedAt) return "not_found";
  if (!(await canDeleteLeaveRequest(user, request))) return "forbidden";

  await db.leaveRequest.delete({ where: { id: requestId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredLeaveRequests(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.leaveRequest.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
