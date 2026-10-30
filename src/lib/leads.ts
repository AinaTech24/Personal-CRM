import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { canManageRecord, isAdmin, isSuperAdmin } from "@/lib/permissions";
import { moduleAccessScope, isModuleBlocked } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { socialMediaTeamScopeFor } from "@/lib/social-media";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

/** Whether `lead` belongs to someone on the caller's Social Media team (creator or assignee). */
function isSocialMediaTeamLead(lead: { createdById: string; assignedToId: string | null }, teamUserIds: string[]) {
  return teamUserIds.includes(lead.createdById) || (!!lead.assignedToId && teamUserIds.includes(lead.assignedToId));
}

/** `action` is READ for viewing, UPDATE for editing — only which action a Leads module grant must carry to widen access; ownership/team access is unaffected by it. */
export async function getLeadForUser(user: PermissionUser, leadId: string, action: Extract<ModuleAction, "READ" | "UPDATE"> = "READ") {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  // A trashed lead is only reachable through the Trash routes (restore/purge),
  // never through the normal view/edit paths — same as if it didn't exist.
  if (!lead || lead.deletedAt) return null;
  if (await isModuleBlocked(user, "LEADS")) return "forbidden" as const;
  if (canManageRecord(user, lead)) return lead;

  const scope = await moduleAccessScope(user, "LEADS", action);
  if (scope === "all") return lead;
  if (scope && lead.departmentId === scope.departmentId) return lead;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (teamUserIds && isSocialMediaTeamLead(lead, teamUserIds)) return lead;

  return "forbidden" as const;
}

/**
 * Deletion is more sensitive than editing — restrict it to Admins, a Leads
 * module grant with delete access over the lead's own department, the
 * lead's creator, and (matching the same widening getLeadForUser applies
 * to editing) a Social Media lead deleting a lead that belongs to their
 * team.
 */
export async function canDeleteLead(user: PermissionUser, lead: { createdById: string; assignedToId: string | null; departmentId: string | null }) {
  if (isAdmin(user) || lead.createdById === user.id) return true;

  const scope = await moduleAccessScope(user, "LEADS", "DELETE");
  if (scope === "all") return true;
  if (scope && lead.departmentId === scope.departmentId) return true;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  return !!teamUserIds && isSocialMediaTeamLead(lead, teamUserIds);
}

/**
 * A lead is visible by default only if it's unassigned to any department
 * (shared/unscoped), or the user personally created/was assigned it — being
 * a member of the same department is no longer enough on its own (see
 * `canManageRecord`'s note for why). Being an Admin widens this
 * company-wide (`{}`); a Leads module grant from the Permission Manager
 * (`scope`, from moduleAccessScope) widens it only to the grant holder's
 * own department — the Department Admin tier between an Admin and a plain
 * Department User.
 *
 * `teamUserIds`, when given (a Social Media lead's own team, from
 * `socialMediaTeamScopeFor`), additionally widens this to every lead created
 * or assigned by anyone on that team — so a Social Media lead sees their
 * team's leads regardless of department, without gaining the company-wide
 * `{}` an Admin gets.
 *
 * `teamOnly` does the opposite: it *forces* the team-scoped clause even for
 * an Admin, bypassing their usual `{}` — for the Social Media Team console's
 * Leads tab, which is a narrower, team-only view regardless of who's looking.
 */
/**
 * Always excludes a soft-deleted (Trash) lead unless `trashed` is set — every
 * normal list/search/dashboard query goes through this, so none of them had
 * to be individually taught about the Trash module. Pass `trashed: true` for
 * the Trash page's own query, which wants exactly the opposite set.
 */
export function leadListWhere(
  user: PermissionUser,
  teamUserIds?: string[] | null,
  teamOnly?: boolean,
  scope?: "all" | { departmentId: string } | null,
  opts?: { trashed?: boolean }
) {
  const deletedAtWhere = opts?.trashed ? { not: null } : null;
  if (teamOnly && teamUserIds) {
    return { AND: [{ deletedAt: deletedAtWhere }, { OR: [{ assignedToId: { in: teamUserIds } }, { createdById: { in: teamUserIds } }] }] };
  }
  if (isSuperAdmin(user) || isAdmin(user) || scope === "all") return { deletedAt: deletedAtWhere };
  const or: object[] = [
    { departmentId: null },
    { assignedToId: user.id },
    { createdById: user.id },
  ];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push({ assignedToId: { in: teamUserIds } }, { createdById: { in: teamUserIds } });
  }
  if (scope && typeof scope === "object") {
    or.push({ departmentId: scope.departmentId });
  }
  return { AND: [{ deletedAt: deletedAtWhere }, { OR: or }] };
}

/**
 * Push a live "the leads list changed" signal to everyone who should see it:
 * the assignee (so it appears the instant they're assigned, even if their
 * department differs), the lead's department room, and all Admins/Super
 * Admins (who can see every lead regardless of department).
 */
export function broadcastLeadChange(
  event: "lead_created" | "lead_updated" | "lead_deleted",
  lead: { id: string; departmentId: string | null; assignedToId: string | null }
) {
  if (lead.assignedToId) emitToUser(lead.assignedToId, event, { leadId: lead.id });
  if (lead.departmentId) emitToDepartment(lead.departmentId, event, { leadId: lead.id });
  emitToAdmins(event, { leadId: lead.id });
}

/**
 * Everyone who can be assigned or added anywhere in the app.
 *
 * Every active user, regardless of department or role — assignment is no longer
 * department-scoped, so any dropdown can offer anyone. `role` rides along so the
 * UI can badge admins and super admins; the caller decides how to show it.
 *
 * The `allActive` half of `opts` is kept for call-site compatibility but no
 * longer changes the result — the list is always the full active roster.
 * `minimal` does still matter: it drops `avatarDataUrl`, a base64 image that
 * can run tens to hundreds of KB per user, for callers (a plain name/role
 * picker like the Clients "Assigned to" dropdown) that never render it —
 * fetching it there was pure wasted bandwidth on every page load.
 */
export async function assignableUsersFor(user: PermissionUser, opts?: { allActive?: boolean; minimal?: boolean }) {
  // allActive kept in the signature so existing call sites still type-check.
  void user;
  void opts?.allActive;
  return db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      surname: true,
      email: true,
      departmentId: true,
      role: true,
      ...(opts?.minimal ? {} : { avatarDataUrl: true }),
    },
    orderBy: { name: "asc" },
  });
}

/* ------------------------------- Trash ------------------------------- */

/** Every trashed lead this user can see — same visibility rule as the live list, just the opposite set of `deletedAt`. */
export async function listTrashedLeadsFor(user: PermissionUser): Promise<TrashItem[]> {
  if (await isModuleBlocked(user, "LEADS")) return [];
  const scope = await moduleAccessScope(user, "LEADS", "READ");
  const teamUserIds = await socialMediaTeamScopeFor(user);
  const leads = await db.lead.findMany({
    where: leadListWhere(user, teamUserIds, false, scope, { trashed: true }),
    include: { deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return leads.map((l) => ({
    id: l.id,
    module: "leads",
    moduleLabel: "Leads",
    title: l.name,
    subtitle: l.company,
    deletedAt: l.deletedAt!.toISOString(),
    deletedBy: l.deletedBy,
    expiresAt: trashExpiresAt(l.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the lead back exactly as it was — nothing about it was ever actually touched while trashed. */
export async function restoreLead(user: PermissionUser, leadId: string): Promise<TrashActionResult> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || !lead.deletedAt) return "not_found";
  if (!(await canDeleteLead(user, lead))) return "forbidden";

  const restored = await db.lead.update({ where: { id: leadId }, data: { deletedAt: null, deletedById: null } });
  await db.leadActivity.create({ data: { leadId, actorId: user.id, action: "restored" } });
  broadcastLeadChange("lead_created", restored);
  return "ok";
}

/** Same permission as deleting it in the first place — if you could trash it, you can also finish emptying it. */
export async function purgeLead(user: PermissionUser, leadId: string): Promise<TrashActionResult> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || !lead.deletedAt) return "not_found";
  if (!(await canDeleteLead(user, lead))) return "forbidden";

  await db.lead.delete({ where: { id: leadId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work — deletes every lead trashed longer ago than the retention window allows. */
export async function purgeExpiredLeads(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.lead.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
