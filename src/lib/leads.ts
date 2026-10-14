import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { canManageRecord, isAdmin, isSuperAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { socialMediaTeamScopeFor } from "@/lib/social-media";

/** Whether `lead` belongs to someone on the caller's Social Media team (creator or assignee). */
function isSocialMediaTeamLead(lead: { createdById: string; assignedToId: string | null }, teamUserIds: string[]) {
  return teamUserIds.includes(lead.createdById) || (!!lead.assignedToId && teamUserIds.includes(lead.assignedToId));
}

export async function getLeadForUser(user: PermissionUser, leadId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  if (canManageRecord(user, lead)) return lead;
  if (await canManageModule(user, "LEADS")) return lead;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (teamUserIds && isSocialMediaTeamLead(lead, teamUserIds)) return lead;

  return "forbidden" as const;
}

/**
 * Deletion is more sensitive than editing — restrict it to Admins, a Leads
 * module grant, the lead's creator, and (matching the same widening
 * getLeadForUser applies to editing) a Social Media lead deleting a lead
 * that belongs to their team.
 */
export async function canDeleteLead(user: PermissionUser, lead: { createdById: string; assignedToId: string | null }) {
  if (isAdmin(user) || lead.createdById === user.id) return true;
  if (await canManageModule(user, "LEADS")) return true;
  const teamUserIds = await socialMediaTeamScopeFor(user);
  return !!teamUserIds && isSocialMediaTeamLead(lead, teamUserIds);
}

/**
 * A lead should be visible to a department user if it's in their department,
 * unassigned to any department, OR they personally created/were assigned it
 * (e.g. a Super Admin assigning across departments) — matching the single-lead
 * access rule in `canManageRecord`, which already accounts for assignment.
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
export function leadListWhere(user: PermissionUser, teamUserIds?: string[] | null, teamOnly?: boolean, fullAccess?: boolean) {
  if (teamOnly && teamUserIds) {
    return { OR: [{ assignedToId: { in: teamUserIds } }, { createdById: { in: teamUserIds } }] };
  }
  if (isSuperAdmin(user) || isAdmin(user) || fullAccess) return {};
  const or: object[] = [
    { departmentId: user.departmentId },
    { departmentId: null },
    { assignedToId: user.id },
    { createdById: user.id },
  ];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push({ assignedToId: { in: teamUserIds } }, { createdById: { in: teamUserIds } });
  }
  return { OR: or };
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
