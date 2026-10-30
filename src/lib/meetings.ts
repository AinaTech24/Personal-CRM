import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { combinedTeamScopeFor } from "@/lib/team-scope";
import { moduleAccessScope, isModuleBlocked } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

/**
 * Same shape as leadListWhere/taskListWhere/projectListWhere — "own record"
 * for a meeting is organizing it or being an attendee. `scope` is resolved
 * by the caller (a DB call via moduleAccessScope, so it stays out of this
 * pure function), same convention as its siblings. Always excludes a
 * trashed meeting unless `trashed` is set, same as those siblings too.
 */
export function meetingListWhere(
  user: PermissionUser,
  teamUserIds?: string[] | null,
  teamOnly?: boolean,
  scope?: "all" | { departmentId: string } | null,
  opts?: { trashed?: boolean }
) {
  const deletedAtWhere = opts?.trashed ? { not: null } : null;
  if (teamOnly && teamUserIds) {
    return {
      AND: [
        { deletedAt: deletedAtWhere },
        { OR: [{ organizerId: { in: teamUserIds } }, { attendees: { some: { id: { in: teamUserIds } } } }] },
      ],
    };
  }
  if (isAdmin(user) || scope === "all") return { deletedAt: deletedAtWhere };
  const or: object[] = [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push({ organizerId: { in: teamUserIds } }, { attendees: { some: { id: { in: teamUserIds } } } });
  }
  if (scope && typeof scope === "object") {
    or.push({ organizer: { departmentId: scope.departmentId } }, { attendees: { some: { departmentId: scope.departmentId } } });
  }
  return { AND: [{ deletedAt: deletedAtWhere }, { OR: or }] };
}

/**
 * Only the organizer, an admin, a Meetings module grant covering the
 * meeting's own department, or a Social Media/CRM lead managing a meeting
 * organized by (or attended by) someone on their team may change, remove,
 * or duplicate a meeting. `allowTrashed` is only ever set by the Trash
 * routes (restore/purge), which need this same check but on a meeting
 * that's deliberately already in that state.
 */
export async function canManageMeeting(
  user: PermissionUser,
  meetingId: string,
  action: Extract<ModuleAction, "UPDATE" | "DELETE">,
  opts?: { allowTrashed?: boolean }
) {
  if (isAdmin(user)) return true;
  const m = await db.meeting.findUnique({
    where: { id: meetingId },
    select: {
      organizerId: true,
      deletedAt: true,
      organizer: { select: { departmentId: true } },
      attendees: { select: { id: true, departmentId: true } },
    },
  });
  if (!m) return false;
  if (!opts?.allowTrashed && m.deletedAt) return false;
  if (m.organizerId === user.id) return true;

  const scope = await moduleAccessScope(user, "MEETINGS", action);
  if (scope === "all") return true;
  if (scope && (m.organizer.departmentId === scope.departmentId || m.attendees.some((a) => a.departmentId === scope.departmentId))) {
    return true;
  }

  const teamUserIds = await combinedTeamScopeFor(user);
  if (!teamUserIds) return false;
  return teamUserIds.includes(m.organizerId) || m.attendees.some((a) => teamUserIds.includes(a.id));
}

/* ------------------------------- Trash ------------------------------- */

const meetingTrashInclude = {
  organizer: { select: { id: true, name: true, departmentId: true } },
  attendees: { select: { id: true, departmentId: true } },
  deletedBy: { select: { id: true, name: true } },
};

/** Same visibility rule the live list applies (meetingListWhere), just the opposite set of `deletedAt`. */
export async function listTrashedMeetingsFor(user: PermissionUser): Promise<TrashItem[]> {
  if (await isModuleBlocked(user, "MEETINGS")) return [];

  const teamUserIds = await combinedTeamScopeFor(user);
  const scope = await moduleAccessScope(user, "MEETINGS", "READ");
  const meetings = await db.meeting.findMany({
    where: meetingListWhere(user, teamUserIds, false, scope, { trashed: true }),
    include: meetingTrashInclude,
    orderBy: { deletedAt: "desc" },
  });
  return meetings.map((m) => ({
    id: m.id,
    module: "meetings",
    moduleLabel: "Meetings",
    title: m.title,
    subtitle: m.organizer.name,
    deletedAt: m.deletedAt!.toISOString(),
    deletedBy: m.deletedBy,
    expiresAt: trashExpiresAt(m.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the meeting back exactly as it was. */
export async function restoreMeeting(user: PermissionUser, meetingId: string): Promise<TrashActionResult> {
  const m = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!m || !m.deletedAt) return "not_found";
  if (!(await canManageMeeting(user, meetingId, "DELETE", { allowTrashed: true }))) return "forbidden";

  await db.meeting.update({ where: { id: meetingId }, data: { deletedAt: null, deletedById: null } });
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeMeeting(user: PermissionUser, meetingId: string): Promise<TrashActionResult> {
  const m = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!m || !m.deletedAt) return "not_found";
  if (!(await canManageMeeting(user, meetingId, "DELETE", { allowTrashed: true }))) return "forbidden";

  await db.meeting.delete({ where: { id: meetingId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredMeetings(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.meeting.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
