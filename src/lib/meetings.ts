import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { combinedTeamScopeFor } from "@/lib/team-scope";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";

/**
 * Only the organizer, an admin, a Meetings module grant covering the
 * meeting's own department, or a Social Media/CRM lead managing a meeting
 * organized by (or attended by) someone on their team may change, remove,
 * or duplicate a meeting.
 */
export async function canManageMeeting(user: PermissionUser, meetingId: string, action: Extract<ModuleAction, "UPDATE" | "DELETE">) {
  if (isAdmin(user)) return true;
  const m = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { organizerId: true, organizer: { select: { departmentId: true } }, attendees: { select: { id: true, departmentId: true } } },
  });
  if (!m) return false;
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
