import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import { socialMediaTeamScopeFor } from "@/lib/social-media";

/** Whether `task` belongs to someone on the caller's Social Media team (creator or assignee). */
function isSocialMediaTeamTask(task: { createdById: string; assignedToId?: string | null }, teamUserIds: string[]) {
  return teamUserIds.includes(task.createdById) || (!!task.assignedToId && teamUserIds.includes(task.assignedToId));
}

export function canManageTask(
  user: PermissionUser,
  task: { createdById: string; assignedToId?: string | null }
) {
  return isAdmin(user) || task.createdById === user.id || task.assignedToId === user.id;
}

export async function getTaskForUser(user: PermissionUser, taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  if (canManageTask(user, task)) return task;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (teamUserIds && isSocialMediaTeamTask(task, teamUserIds)) return task;

  return "forbidden" as const;
}

/**
 * Deletion is more sensitive than editing — restrict it to Admins, the
 * task's creator, and a Social Media lead deleting a task belonging to
 * their team (matching the same widening getTaskForUser applies to editing).
 */
export async function canDeleteTask(user: PermissionUser, task: { createdById: string; assignedToId?: string | null }) {
  if (isAdmin(user) || task.createdById === user.id) return true;
  const teamUserIds = await socialMediaTeamScopeFor(user);
  return !!teamUserIds && isSocialMediaTeamTask(task, teamUserIds);
}

/**
 * Tasks aren't department-scoped — visible to admins, the creator, and the
 * assignee. `teamUserIds`, when given (a Social Media lead's own team, from
 * socialMediaTeamScopeFor), additionally widens this to every task created
 * or assigned to anyone on that team.
 */
export function taskListWhere(user: PermissionUser, teamUserIds?: string[] | null) {
  if (isAdmin(user)) return {};
  const or: object[] = [{ createdById: user.id }, { assignedToId: user.id }];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push({ createdById: { in: teamUserIds } }, { assignedToId: { in: teamUserIds } });
  }
  return { OR: or };
}

export function broadcastTaskChange(
  event: "task_created" | "task_updated" | "task_deleted",
  task: { id: string; createdById: string; assignedToId: string | null }
) {
  emitToUser(task.createdById, event, { taskId: task.id });
  if (task.assignedToId) emitToUser(task.assignedToId, event, { taskId: task.id });
  emitToAdmins(event, { taskId: task.id });
}
