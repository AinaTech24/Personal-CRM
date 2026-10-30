import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope, isModuleBlocked } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { socialMediaTeamScopeFor } from "@/lib/social-media";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

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
    include: { members: { select: { userId: true } }, assignees: { select: { id: true } } },
  });
  // A trashed project is only reachable through the Trash routes (restore/purge).
  if (!project || project.deletedAt) return null;
  if (!isAdmin(user) && (await isModuleBlocked(user, "PROJECTS"))) return "forbidden" as const;

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
  scope?: "all" | { departmentId: string } | null,
  opts?: { trashed?: boolean }
) {
  const deletedAtWhere = opts?.trashed ? { not: null } : null;
  if (teamOnly && teamUserIds) {
    return {
      AND: [
        { deletedAt: deletedAtWhere },
        { OR: [{ createdById: { in: teamUserIds } }, { members: { some: { userId: { in: teamUserIds } } } }] },
      ],
    };
  }
  if (isAdmin(user) || scope === "all") return { deletedAt: deletedAtWhere };
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
  return { AND: [{ deletedAt: deletedAtWhere }, { OR: or }] };
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

/* ------------------------------- Trash ------------------------------- */

/** Every trashed project this user can see — same visibility rule as the live list, just the opposite set of `deletedAt`. */
export async function listTrashedProjectsFor(user: PermissionUser): Promise<TrashItem[]> {
  if (await isModuleBlocked(user, "PROJECTS")) return [];
  const scope = await moduleAccessScope(user, "PROJECTS", "READ");
  const teamUserIds = await socialMediaTeamScopeFor(user);
  const projects = await db.project.findMany({
    where: projectListWhere(user, teamUserIds, false, scope, { trashed: true }),
    include: { department: { select: { name: true } }, deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return projects.map((p) => ({
    id: p.id,
    module: "projects",
    moduleLabel: "Projects",
    title: p.name,
    subtitle: p.department.name,
    deletedAt: p.deletedAt!.toISOString(),
    deletedBy: p.deletedBy,
    expiresAt: trashExpiresAt(p.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the project back exactly as it was. */
export async function restoreProject(user: PermissionUser, projectId: string): Promise<TrashActionResult> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { members: { select: { userId: true } } } });
  if (!project || !project.deletedAt) return "not_found";
  if (!(await canDeleteProject(user, project))) return "forbidden";

  const restored = await db.project.update({ where: { id: projectId }, data: { deletedAt: null, deletedById: null } });
  broadcastProjectChange("project_created", restored, project.members.map((m) => m.userId));
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeProject(user: PermissionUser, projectId: string): Promise<TrashActionResult> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { members: { select: { userId: true } } } });
  if (!project || !project.deletedAt) return "not_found";
  if (!(await canDeleteProject(user, project))) return "forbidden";

  await db.project.delete({ where: { id: projectId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredProjects(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.project.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
