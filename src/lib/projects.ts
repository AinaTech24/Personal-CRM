import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { socialMediaTeamScopeFor } from "@/lib/social-media";

/** Whether `project` belongs to someone on the caller's Social Media team (creator, assignee, or a member). */
function isSocialMediaTeamProject(
  project: { createdById: string; members: { userId: string }[] },
  teamUserIds: string[]
) {
  return teamUserIds.includes(project.createdById) || project.members.some((m) => teamUserIds.includes(m.userId));
}

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
    project.departmentId === user.departmentId ||
    (await canManageModule(user, "PROJECTS"));

  if (allowed) return project;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (teamUserIds && isSocialMediaTeamProject(project, teamUserIds)) return project;

  return "forbidden" as const;
}

/**
 * A project is visible if it's in the user's department, they created it, or
 * they're a member. `teamUserIds`, when given (a Social Media lead's own
 * team, from socialMediaTeamScopeFor), additionally widens this to every
 * project created by, or with a member from, that team.
 *
 * `teamOnly` forces the team-scoped clause even for an Admin, bypassing
 * their usual `{}` — for the Social Media Team console's Projects tab, a
 * narrower, team-only view regardless of who's looking.
 */
export function projectListWhere(user: PermissionUser, teamUserIds?: string[] | null, teamOnly?: boolean, fullAccess?: boolean) {
  if (teamOnly && teamUserIds) {
    return { OR: [{ createdById: { in: teamUserIds } }, { members: { some: { userId: { in: teamUserIds } } } }] };
  }
  if (isAdmin(user) || fullAccess) return {};
  const or: object[] = [
    { departmentId: user.departmentId ?? "__none__" },
    { createdById: user.id },
    { members: { some: { userId: user.id } } },
  ];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push({ createdById: { in: teamUserIds } }, { members: { some: { userId: { in: teamUserIds } } } });
  }
  return { OR: or };
}

/**
 * Deletion is restricted to Admins, the project's creator, and a Social
 * Media lead deleting a project that belongs to their team (matching the
 * same widening getProjectForUser applies to editing).
 */
export async function canDeleteProject(
  user: PermissionUser,
  project: { createdById: string; members: { userId: string }[] }
) {
  if (isAdmin(user) || project.createdById === user.id) return true;
  if (await canManageModule(user, "PROJECTS")) return true;
  const teamUserIds = await socialMediaTeamScopeFor(user);
  return !!teamUserIds && isSocialMediaTeamProject(project, teamUserIds);
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
