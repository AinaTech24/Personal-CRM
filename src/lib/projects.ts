import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";

export async function getProjectForUser(user: PermissionUser, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { members: { select: { userId: true } } },
  });
  if (!project) return null;

  const isMember = project.members.some((m) => m.userId === user.id);
  const allowed =
    isAdmin(user) ||
    project.createdById === user.id ||
    isMember ||
    project.departmentId === user.departmentId;

  if (!allowed) return "forbidden" as const;
  return project;
}

/** A project is visible if it's in the user's department, they created it, or they're a member. */
export function projectListWhere(user: PermissionUser) {
  if (isAdmin(user)) return {};
  return {
    OR: [
      { departmentId: user.departmentId ?? "__none__" },
      { createdById: user.id },
      { members: { some: { userId: user.id } } },
    ],
  };
}

/** Deletion is restricted to Admins and the project's creator. */
export function canDeleteProject(user: PermissionUser, project: { createdById: string }) {
  return isAdmin(user) || project.createdById === user.id;
}

export function broadcastProjectChange(
  event: "project_created" | "project_updated" | "project_deleted",
  project: { id: string; departmentId: string },
  memberIds: string[] = []
) {
  emitToDepartment(project.departmentId, event, { projectId: project.id });
  emitToAdmins(event, { projectId: project.id });
  for (const userId of memberIds) emitToUser(userId, event, { projectId: project.id });
}

export async function logProjectActivity(projectId: string, actorId: string, action: string, meta?: object) {
  await db.projectActivity.create({ data: { projectId, actorId, action, meta } });
}
