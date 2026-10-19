import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { socialMediaTeamScopeFor } from "@/lib/social-media";

/** Whether `project` belongs to someone on the caller's Social Media team (creator, assignee, or a member). */
function isSocialMediaTeamProject(
  project: { createdById: string; members: { userId: string }[] },
  teamUserIds: string[]
) {
  return teamUserIds.includes(project.createdById) || project.members.some((m) => teamUserIds.includes(m.userId));
}

/** `action` is READ for viewing, UPDATE for editing — only which action a Projects module grant must carry to widen access; ownership/department/team access is unaffected by it. */
export async function getProjectForUser(
  user: PermissionUser,
  projectId: string,
  action: Extract<ModuleAction, "READ" | "UPDATE"> = "READ"
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { members: { select: { userId: true } } },
  });
  if (!project) return null;

  const isMember = project.members.some((m) => m.userId === user.id);
  if (isAdmin(user) || project.createdById === user.id || isMember) return project;

  const scope = await moduleAccessScope(user, "PROJECTS", action);
  if (scope === "all" || (scope && project.departmentId === scope.departmentId)) return project;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (teamUserIds && isSocialMediaTeamProject(project, teamUserIds)) return project;

  return "forbidden" as const;
}

/**
 * A project is visible by default only if the user created it or is a
 * member — being in the same department no longer grants visibility into
 * every project in it on its own (see `canManageRecord`'s note for why).
 * `teamUserIds`, when given (a Social Media lead's own team, from
 * socialMediaTeamScopeFor), additionally widens this to every project
 * created by, or with a member from, that team. Being an Admin widens this
 * company-wide (`{}`); a Projects module grant from the Permission Manager
 * (`scope`, from moduleAccessScope) widens it only to the grant holder's
 * own department.
 *
 * `teamOnly` forces the team-scoped clause even for an Admin, bypassing
 * their usual `{}` — for the Social Media Team console's Projects tab, a
 * narrower, team-only view regardless of who's looking.
 */
export function projectListWhere(
  user: PermissionUser,
  teamUserIds?: string[] | null,
  teamOnly?: boolean,
  scope?: "all" | { departmentId: string } | null
) {
  if (teamOnly && teamUserIds) {
    return { OR: [{ createdById: { in: teamUserIds } }, { members: { some: { userId: { in: teamUserIds } } } }] };
  }
  if (isAdmin(user) || scope === "all") return {};
  const or: object[] = [
    { createdById: user.id },
    { members: { some: { userId: user.id } } },
  ];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push({ createdById: { in: teamUserIds } }, { members: { some: { userId: { in: teamUserIds } } } });
  }
  if (scope && typeof scope === "object") {
    or.push({ departmentId: scope.departmentId });
  }
  return { OR: or };
}

/**
 * Deletion is restricted to Admins, the project's creator, a Projects
 * module grant with delete access over the project's own department, and a
 * Social Media lead deleting a project that belongs to their team (matching
 * the same widening getProjectForUser applies to editing).
 */
export async function canDeleteProject(
  user: PermissionUser,
  project: { createdById: string; departmentId: string; members: { userId: string }[] }
) {
  if (isAdmin(user) || project.createdById === user.id) return true;

  const scope = await moduleAccessScope(user, "PROJECTS", "DELETE");
  if (scope === "all" || (scope && project.departmentId === scope.departmentId)) return true;

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
