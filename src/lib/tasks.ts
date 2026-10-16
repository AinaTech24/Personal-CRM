import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
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

/** `action` is READ for viewing, UPDATE for editing — only which action a Tasks module grant must carry to widen access; ownership/team access is unaffected by it. */
export async function getTaskForUser(user: PermissionUser, taskId: string, action: Extract<ModuleAction, "READ" | "UPDATE"> = "READ") {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  if (canManageTask(user, task)) return task;
  if (await canManageModule(user, "TASKS", action)) return task;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (teamUserIds && isSocialMediaTeamTask(task, teamUserIds)) return task;

  return "forbidden" as const;
}

/**
 * Deletion is more sensitive than editing — restrict it to Admins, a Tasks
 * module grant with delete access, the task's creator, and a Social Media
 * lead deleting a task belonging to their team (matching the same widening
 * getTaskForUser applies to editing).
 */
export async function canDeleteTask(user: PermissionUser, task: { createdById: string; assignedToId?: string | null }) {
  if (isAdmin(user) || task.createdById === user.id) return true;
  if (await canManageModule(user, "TASKS", "DELETE")) return true;
  const teamUserIds = await socialMediaTeamScopeFor(user);
  return !!teamUserIds && isSocialMediaTeamTask(task, teamUserIds);
}

/**
 * Tasks aren't department-scoped — visible to admins, the creator, and the
 * assignee. `teamUserIds`, when given (a Social Media lead's own team, from
 * socialMediaTeamScopeFor), additionally widens this to every task created
 * or assigned to anyone on that team. `fullAccess` (a Tasks module grant)
 * widens it the same way an Admin's `{}` does, company-wide.
 *
 * `teamOnly` forces the team-scoped clause even for an Admin, bypassing
 * their usual `{}` — for the Social Media Team console's Tasks tab, a
 * narrower, team-only view regardless of who's looking.
 */
export function taskListWhere(user: PermissionUser, teamUserIds?: string[] | null, teamOnly?: boolean, fullAccess?: boolean) {
  if (teamOnly && teamUserIds) {
    return { OR: [{ createdById: { in: teamUserIds } }, { assignedToId: { in: teamUserIds } }] };
  }
  if (isAdmin(user) || fullAccess) return {};
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
