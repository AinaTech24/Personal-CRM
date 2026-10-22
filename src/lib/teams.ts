import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import type { TeamMembership } from "@/lib/team-permissions";

export type { TeamMembership };

/**
 * A user's membership on the team identified by `slug`, or null if they
 * have none, aren't a member, or the team is disabled (a disabled team's
 * membership is treated as absent everywhere, which is what cuts off
 * access downstream without touching every call site individually).
 *
 * src/lib/social-media.ts and src/lib/crm-team.ts read/write through here
 * by slug ("social-media"/"crm") rather than their own dedicated models —
 * see the Teams unification plan.
 */
export async function getTeamMembershipBySlug(userId: string, slug: string): Promise<TeamMembership | null> {
  return db.teamMember.findFirst({
    where: { userId, team: { slug, disabled: false } },
    select: { isLead: true },
  });
}

/** Every member of the team identified by `slug` (disabled teams excluded), unfiltered by department — for broadcast and as the source for the department-filtered scope below. */
async function getTeamMembersBySlug(slug: string): Promise<{ userId: string; isLead: boolean; departmentId: string | null }[]> {
  const rows = await db.teamMember.findMany({
    where: { team: { slug, disabled: false } },
    select: { userId: true, isLead: true, user: { select: { departmentId: true } } },
  });
  return rows.map((r) => ({ userId: r.userId, isLead: r.isLead, departmentId: r.user.departmentId }));
}

/**
 * Every user id on the team identified by `slug`, restricted to those
 * actually in the team's own department (or with no department at all —
 * e.g. someone invited straight into the team, who was never assigned one
 * in the first place and so can't be "from a different department") —
 * derived from the team's lead(s) rather than a hardcoded id, so a one-off
 * member added for a single review doesn't pull their own unrelated
 * leads/tasks/attendance into this team's aggregate views. Falls back to
 * the unfiltered roster if no lead has a department set.
 *
 * `preferredDepartmentId`, when given, wins over the derived one — callers
 * pass the CALLING lead's own department here (never an admin's, who has no
 * department-of-the-team to speak of). Without it, a team with leads spread
 * across two departments would pick whichever lead's department happened to
 * come back first from the roster query, which could exclude a lead from
 * their own team's scope (e.g. from approving their own attendance) simply
 * because a different lead's department "won" that lookup.
 */
export async function getTeamUserIdsBySlug(slug: string, preferredDepartmentId?: string | null): Promise<string[]> {
  const members = await getTeamMembersBySlug(slug);
  const departmentId = preferredDepartmentId ?? members.find((m) => m.isLead && m.departmentId)?.departmentId ?? null;
  if (!departmentId) return members.map((m) => m.userId);
  return members.filter((m) => m.departmentId === departmentId || m.departmentId === null).map((m) => m.userId);
}

/** Every user id on the team with this id, restricted to the team's own department (or with no department at all) — by-id sibling of getTeamUserIdsBySlug (see its comment for the department-scoping rationale), for any team including a non-system one that has no fixed slug to key off. */
export async function getTeamUserIds(teamId: string, preferredDepartmentId?: string | null): Promise<string[]> {
  const rows = await db.teamMember.findMany({
    where: { teamId, team: { disabled: false } },
    select: { userId: true, isLead: true, user: { select: { departmentId: true } } },
  });
  const members = rows.map((r) => ({ userId: r.userId, isLead: r.isLead, departmentId: r.user.departmentId }));
  const departmentId = preferredDepartmentId ?? members.find((m) => m.isLead && m.departmentId)?.departmentId ?? null;
  if (!departmentId) return members.map((m) => m.userId);
  return members.filter((m) => m.departmentId === departmentId || m.departmentId === null).map((m) => m.userId);
}

/**
 * A team's user ids, when `user` may legitimately narrow a list down to
 * just this team — an Admin/Super Admin, or the team's own lead. Mirrors
 * crmTeamOnlyScopeFor/socialMediaTeamOnlyScopeFor, generalized to any team
 * by id for the `scope=team:<id>` query param Leads/Tasks/Meetings/Projects
 * share.
 */
export async function teamOnlyScopeFor(user: PermissionUser, teamId: string): Promise<string[] | null> {
  if (isAdmin(user)) return getTeamUserIds(teamId);
  const membership = await getUserTeamMembership(teamId, user.id);
  if (!membership) return null;
  // A genuine member who isn't a lead still gets their own records, same as
  // the main (non-team) Leads/Tasks/Meetings/Projects pages already show
  // them — only non-members get shut out entirely.
  if (!membership.isLead) return [user.id];
  return getTeamUserIds(teamId, user.departmentId);
}

/**
 * The union of every (non-disabled) team `user` leads' own user ids — the
 * generalized version of combining socialMediaTeamScopeFor + crmTeamScopeFor
 * for leave-requests' `?scope=all`, so a lead of any custom team (not just
 * Social Media/CRM, both of which are themselves just rows in this same
 * table) sees their team's leave requests too. Empty for a company admin,
 * who doesn't need widening — their access is already unrestricted.
 *
 * Deliberately does NOT pass `user.departmentId` as each team's
 * preferredDepartmentId the way a single-team caller (teamOnlyScopeFor,
 * crmTeamScopeFor, ...) does — this iterates every team the user leads, and
 * their own department only disambiguates co-leads correctly for a team
 * it's actually likely to belong to. Forcing it onto every led team would
 * wipe out any team whose real membership sits in a different department
 * than this particular lead's own.
 */
export async function allLedTeamsScopeFor(user: PermissionUser): Promise<string[]> {
  if (isAdmin(user)) return [];
  const led = await db.teamMember.findMany({
    where: { userId: user.id, isLead: true, team: { disabled: false } },
    select: { teamId: true },
  });
  if (led.length === 0) return [];
  const ids = new Set<string>();
  for (const { teamId } of led) {
    for (const id of await getTeamUserIds(teamId)) ids.add(id);
  }
  return [...ids];
}

/** Broadcasts to every member of the team identified by `slug`, plus admins — not a global event everyone would receive regardless of access. */
export async function broadcastTeamChangeBySlug(slug: string, event: string, payload: unknown) {
  emitToAdmins(event, payload);
  const members = await getTeamMembersBySlug(slug);
  for (const m of members) emitToUser(m.userId, event, payload);
}

export interface TeamMemberRow {
  id: string;
  userId: string;
  isLead: boolean;
  createdAt: Date;
  user: { id: string; name: string; surname: string | null; email: string };
}

const MEMBER_ROW_SELECT = {
  id: true,
  userId: true,
  isLead: true,
  createdAt: true,
  user: { select: { id: true, name: true, surname: true, email: true } },
} as const;

export async function getTeamIdBySlug(slug: string): Promise<string | null> {
  const team = await db.team.findUnique({ where: { slug }, select: { id: true } });
  return team?.id ?? null;
}

/** The member roster for src/app/api/social|crm/members's GET — same shape the team console already renders. */
export async function listTeamMembersBySlug(slug: string): Promise<TeamMemberRow[]> {
  return db.teamMember.findMany({ where: { team: { slug } }, orderBy: { createdAt: "asc" }, select: MEMBER_ROW_SELECT });
}

export async function upsertTeamMemberBySlug(slug: string, userId: string, isLead: boolean): Promise<TeamMemberRow> {
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) throw new Error(`No team with slug "${slug}"`);
  return db.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, isLead },
    update: { isLead },
    select: MEMBER_ROW_SELECT,
  });
}

export async function updateTeamMemberLeadBySlug(slug: string, userId: string, isLead: boolean): Promise<TeamMemberRow | null> {
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return null;
  return db.teamMember
    .update({ where: { teamId_userId: { teamId, userId } }, data: { isLead }, select: MEMBER_ROW_SELECT })
    .catch(() => null);
}

export async function removeTeamMemberBySlug(slug: string, userId: string) {
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return;
  await db.teamMember.deleteMany({ where: { teamId, userId } });
}

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  disabled: boolean;
  memberCount: number;
}

function toSummary(t: { id: string; name: string; slug: string; isSystem: boolean; disabled: boolean; _count: { members: number } }): TeamSummary {
  return { id: t.id, name: t.name, slug: t.slug, isSystem: t.isSystem, disabled: t.disabled, memberCount: t._count.members };
}

/** Every team — for the Teams page, an Admin sees all of them. */
export async function listTeams(): Promise<TeamSummary[]> {
  const teams = await db.team.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { members: true } } } });
  return teams.map(toSummary);
}

/** Only the teams this user belongs to — for a non-admin's Teams page. */
export async function listTeamsForUser(userId: string): Promise<TeamSummary[]> {
  const teams = await db.team.findMany({
    where: { members: { some: { userId } } },
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true } } },
  });
  return teams.map(toSummary);
}

/** One team plus every member — the team's own console. */
export async function getTeamDetail(id: string) {
  return db.team.findUnique({
    where: { id },
    include: {
      members: {
        select: {
          isLead: true,
          user: { select: { id: true, name: true, surname: true, email: true, avatarDataUrl: true, role: true, isActive: true } },
        },
        orderBy: { user: { name: "asc" } },
      },
    },
  });
}

/** A disabled team's membership reads as absent here too — matching getTeamMembershipBySlug — so disabling a custom team actually locks its (former) lead out of managing it, not just shows a badge. */
export async function getUserTeamMembership(teamId: string, userId: string): Promise<TeamMembership | null> {
  return db.teamMember.findFirst({
    where: { teamId, userId, team: { disabled: false } },
    select: { isLead: true },
  });
}

/** A brand-new, non-system team — only ever created this way, so `isSystem` never needs to be set true from here. */
export async function createTeam(name: string) {
  const slug = slugify(name);
  if (!slug) throw new Error("Enter a name");
  const existing = await db.team.findUnique({ where: { slug } });
  if (existing) throw new Error("A team with that name already exists");
  return db.team.create({ data: { name, slug } });
}

/** Renames a team. The slug is fixed at creation — business logic elsewhere keys off it, so it's never user-editable. */
export async function renameTeam(id: string, name: string) {
  return db.team.update({ where: { id }, data: { name } });
}

export async function setTeamDisabled(id: string, disabled: boolean) {
  return db.team.update({ where: { id }, data: { disabled } });
}

export async function addTeamMember(teamId: string, userId: string, isLead = false) {
  return db.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, isLead },
    update: { isLead },
  });
}

export async function removeTeamMember(teamId: string, userId: string) {
  await db.teamMember.deleteMany({ where: { teamId, userId } });
}

/**
 * Whether `actorId` leads a (non-disabled) team that `targetId` also
 * belongs to — the team equivalent of canManagePermissionsFor's Department
 * Admin case, used to let a team lead manage their own team members'
 * module permissions from the Teams console.
 */
export async function sharesLedTeamWith(actorId: string, targetId: string): Promise<boolean> {
  if (actorId === targetId) return false;
  const led = await db.teamMember.findMany({
    where: { userId: actorId, isLead: true, team: { disabled: false } },
    select: { teamId: true },
  });
  if (led.length === 0) return false;
  const shared = await db.teamMember.findFirst({
    where: { userId: targetId, teamId: { in: led.map((t) => t.teamId) } },
    select: { id: true },
  });
  return !!shared;
}
