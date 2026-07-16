import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";

export function canManageTask(
  user: PermissionUser,
  task: { createdById: string; assignedToId?: string | null }
) {
  return isAdmin(user) || task.createdById === user.id || task.assignedToId === user.id;
}

export async function getTaskForUser(user: PermissionUser, taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  if (!canManageTask(user, task)) return "forbidden" as const;
  return task;
}

/** Deletion is more sensitive than editing — restrict it to Admins and the task's creator. */
export function canDeleteTask(user: PermissionUser, task: { createdById: string }) {
  return isAdmin(user) || task.createdById === user.id;
}

/** Tasks aren't department-scoped — visible to admins, the creator, and the assignee. */
export function taskListWhere(user: PermissionUser) {
  if (isAdmin(user)) return {};
  return {
    OR: [{ createdById: user.id }, { assignedToId: user.id }],
  };
}

export function broadcastTaskChange(
  event: "task_created" | "task_updated" | "task_deleted",
  task: { id: string; createdById: string; assignedToId: string | null }
) {
  emitToUser(task.createdById, event, { taskId: task.id });
  if (task.assignedToId) emitToUser(task.assignedToId, event, { taskId: task.id });
  emitToAdmins(event, { taskId: task.id });
}
