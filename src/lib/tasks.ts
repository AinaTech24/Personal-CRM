import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import { socialMediaTeamScopeFor } from "@/lib/social-media";

interface TaskAssigneeShape {
  assignedToId?: string | null;
  assignees?: { id: string; departmentId?: string | null }[];
}

/**
 * Every user this task is assigned to — `assignees` is the source of truth
 * once set, but a task created before that relation existed (or touched by
 * code that still only writes the scalar) may have `assignedToId` set with
 * an empty `assignees`, so both are checked everywhere "is this user the/an
 * assignee" matters.
 */
function assigneeIdsOf(task: TaskAssigneeShape): string[] {
  const ids = new Set((task.assignees ?? []).map((a) => a.id));
  if (task.assignedToId) ids.add(task.assignedToId);
  return [...ids];
}

/** Whether `task` belongs to someone on the caller's Social Media team (creator or any assignee). */
function isSocialMediaTeamTask(task: { createdById: string } & TaskAssigneeShape, teamUserIds: string[]) {
  if (teamUserIds.includes(task.createdById)) return true;
  return assigneeIdsOf(task).some((id) => teamUserIds.includes(id));
}

export function canManageTask(user: PermissionUser, task: { createdById: string } & TaskAssigneeShape) {
  return isAdmin(user) || task.createdById === user.id || assigneeIdsOf(task).includes(user.id);
}

/** `action` is READ for viewing, UPDATE for editing — only which action a Tasks module grant must carry to widen access; ownership/team access is unaffected by it. */
export async function getTaskForUser(user: PermissionUser, taskId: string, action: Extract<ModuleAction, "READ" | "UPDATE"> = "READ") {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      createdBy: { select: { departmentId: true } },
      assignedTo: { select: { departmentId: true } },
      assignees: { select: { id: true, departmentId: true } },
    },
  });
  if (!task) return null;
  if (canManageTask(user, task)) return task;

  const scope = await moduleAccessScope(user, "TASKS", action);
  if (scope === "all") return task;
  if (
    scope &&
    (task.createdBy.departmentId === scope.departmentId ||
      task.assignedTo?.departmentId === scope.departmentId ||
      task.assignees.some((a) => a.departmentId === scope.departmentId))
  ) {
    return task;
  }

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (teamUserIds && isSocialMediaTeamTask(task, teamUserIds)) return task;

  return "forbidden" as const;
}

/**
 * Deletion is more sensitive than editing — restrict it to Admins, a Tasks
 * module grant with delete access over the task's own department, the
 * task's creator, and a Social Media lead deleting a task belonging to
 * their team (matching the same widening getTaskForUser applies to
 * editing).
 */
export async function canDeleteTask(
  user: PermissionUser,
  task: { createdById: string; createdBy?: { departmentId: string | null }; assignedTo?: { departmentId: string | null } | null } & TaskAssigneeShape
) {
  if (isAdmin(user) || task.createdById === user.id) return true;

  const scope = await moduleAccessScope(user, "TASKS", "DELETE");
  if (scope === "all") return true;
  if (
    scope &&
    (task.createdBy?.departmentId === scope.departmentId ||
      task.assignedTo?.departmentId === scope.departmentId ||
      (task.assignees ?? []).some((a) => a.departmentId === scope.departmentId))
  ) {
    return true;
  }

  const teamUserIds = await socialMediaTeamScopeFor(user);
  return !!teamUserIds && isSocialMediaTeamTask(task, teamUserIds);
}

/**
 * Tasks aren't department-scoped by their own field — visible to admins,
 * the creator, and every assignee. `teamUserIds`, when given (a Social
 * Media lead's own team, from socialMediaTeamScopeFor), additionally widens
 * this to every task created or assigned to anyone on that team. `scope` (a
 * Tasks module grant, from moduleAccessScope) widens it the same way an
 * Admin's `{}` does for "all" — company-wide — or, for a department-scoped
 * grant, to every task created or assigned to anyone in that department.
 *
 * `teamOnly` forces the team-scoped clause even for an Admin, bypassing
 * their usual `{}` — for the Social Media Team console's Tasks tab, a
 * narrower, team-only view regardless of who's looking.
 */
export function taskListWhere(
  user: PermissionUser,
  teamUserIds?: string[] | null,
  teamOnly?: boolean,
  scope?: "all" | { departmentId: string } | null
) {
  if (teamOnly && teamUserIds) {
    return {
      OR: [
        { createdById: { in: teamUserIds } },
        { assignedToId: { in: teamUserIds } },
        { assignees: { some: { id: { in: teamUserIds } } } },
      ],
    };
  }
  if (isAdmin(user) || scope === "all") return {};
  const or: object[] = [{ createdById: user.id }, { assignedToId: user.id }, { assignees: { some: { id: user.id } } }];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push(
      { createdById: { in: teamUserIds } },
      { assignedToId: { in: teamUserIds } },
      { assignees: { some: { id: { in: teamUserIds } } } }
    );
  }
  if (scope && typeof scope === "object") {
    or.push(
      { createdBy: { departmentId: scope.departmentId } },
      { assignedTo: { departmentId: scope.departmentId } },
      { assignees: { some: { departmentId: scope.departmentId } } }
    );
  }
  return { OR: or };
}

export function broadcastTaskChange(
  event: "task_created" | "task_updated" | "task_deleted",
  task: { id: string; createdById: string; assignedToId: string | null } & { assignees?: { id: string }[] }
) {
  emitToUser(task.createdById, event, { taskId: task.id });
  for (const id of assigneeIdsOf(task)) emitToUser(id, event, { taskId: task.id });
  emitToAdmins(event, { taskId: task.id });
}
