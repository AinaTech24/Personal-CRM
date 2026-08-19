import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import { isCrmLead, isCrmOnlyUser, type CrmMembership } from "@/lib/crm-permissions";

export type { CrmMembership };
export { hasCrmAccess, isCrmLead, isCrmOnlyUser } from "@/lib/crm-permissions";

/** The current user's CRM Team membership row, or null if they have none (and aren't a company admin). */
export async function getCrmMembership(userId: string): Promise<CrmMembership | null> {
  return db.crmMember.findUnique({ where: { userId }, select: { isLead: true } });
}

/**
 * The department every genuine CRM Team member is expected to belong to —
 * derived from the team's own lead(s) rather than a hardcoded name/slug,
 * same reasoning as socialMediaDepartmentId in social-media.ts. Null only if
 * no lead has a department set at all, in which case callers fall back to
 * the unfiltered roster rather than hiding everyone.
 */
async function crmDepartmentId(): Promise<string | null> {
  const lead = await db.crmMember.findFirst({
    where: { isLead: true, user: { departmentId: { not: null } } },
    select: { user: { select: { departmentId: true } } },
  });
  return lead?.user.departmentId ?? null;
}

/**
 * Every user id currently on the CRM Team, restricted to those actually IN
 * the CRM department — not just anyone with a CrmMember row. Same reasoning
 * as getSocialMediaTeamUserIds: adding an existing user as a one-off
 * reviewer shouldn't pull their own unrelated work into this team's
 * aggregate views.
 */
export async function getCrmTeamUserIds(): Promise<string[]> {
  const members = await db.crmMember.findMany({ select: { userId: true, user: { select: { departmentId: true } } } });
  const departmentId = await crmDepartmentId();
  if (!departmentId) return members.map((m) => m.userId);
  return members.filter((m) => m.user.departmentId === departmentId).map((m) => m.userId);
}

/**
 * The CRM Team's user ids, but only when this caller is a team-scoped lead
 * who isn't already a company Admin/Super Admin — mirrors
 * socialMediaTeamScopeFor exactly. Returns null when there's nothing to
 * widen the caller's own-record visibility with.
 */
export async function crmTeamScopeFor(user: PermissionUser): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) return null;
  return getCrmTeamUserIds();
}

/**
 * The CRM Team's user ids, when the caller may legitimately narrow a list
 * down to just this team — an Admin/Super Admin, or a CRM lead. Mirrors
 * socialMediaTeamOnlyScopeFor exactly; used for the `scope=crm` query param
 * on Leads/Tasks/Meetings/Projects/Calls.
 */
export async function crmTeamOnlyScopeFor(user: PermissionUser): Promise<string[] | null> {
  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) return null;
  return getCrmTeamUserIds();
}

/**
 * Whether `user` may mark/edit/approve another user's attendance for the CRM
 * Team — a company Admin/Super Admin always can; a CRM lead can, but only
 * for someone on their own team. Mirrors social-media.ts's
 * canManageAttendanceFor.
 */
export async function canManageCrmAttendanceFor(user: PermissionUser, targetUserId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const teamUserIds = await crmTeamScopeFor(user);
  return !!teamUserIds && teamUserIds.includes(targetUserId);
}

/**
 * One-call guard for routes a CRM Team member (regular or lead, not a
 * company admin) shouldn't reach — mirrors isRestrictedFromModule. Not
 * currently applied to any module (unlike Social Media's Quotations
 * exclusion): a CRM/Sales team plausibly needs Quotations and Invoices, so
 * nothing is excluded here by default.
 */
export async function isRestrictedFromCrmModule(user: PermissionUser): Promise<boolean> {
  const membership = await getCrmMembership(user.id);
  return isCrmOnlyUser(user, membership);
}

/**
 * Broadcasts to exactly who can see the CRM Team module — every current
 * CrmMember plus admins — rather than a global event every connected client
 * would receive regardless of access.
 */
export async function broadcastCrmChange(event: string, payload: unknown) {
  emitToAdmins(event, payload);
  const members = await db.crmMember.findMany({ select: { userId: true } });
  for (const m of members) emitToUser(m.userId, event, payload);
}
