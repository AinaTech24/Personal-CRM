import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { isCrmLead, isCrmOnlyUser, type CrmMembership } from "@/lib/crm-permissions";
import { getTeamMembershipBySlug, getTeamUserIdsBySlug, broadcastTeamChangeBySlug } from "@/lib/teams";

export type { CrmMembership };
export { hasCrmAccess, isCrmLead, isCrmOnlyUser } from "@/lib/crm-permissions";

/** The "CRM" row in the generic Team table (seeded by scripts/migrate-social-crm-to-teams.ts) that this module reads/writes through — see the Teams unification plan. */
const TEAM_SLUG = "crm";

/** The current user's CRM Team membership, or null if they have none (and aren't a company admin), reading through the generic Team/TeamMember tables. */
export async function getCrmMembership(userId: string): Promise<CrmMembership | null> {
  return getTeamMembershipBySlug(userId, TEAM_SLUG);
}

/**
 * Every user id currently on the CRM Team, restricted to those actually IN
 * the CRM department — not just anyone with a membership row. Same
 * reasoning as getSocialMediaTeamUserIds: adding an existing user as a
 * one-off reviewer shouldn't pull their own unrelated work into this team's
 * aggregate views.
 */
export async function getCrmTeamUserIds(preferredDepartmentId?: string | null): Promise<string[]> {
  return getTeamUserIdsBySlug(TEAM_SLUG, preferredDepartmentId);
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
  // isAdmin already returned above, so this is a genuine lead membership —
  // prefer their own department over an arbitrary lead's.
  return getCrmTeamUserIds(user.departmentId);
}

/**
 * The CRM Team's user ids, when the caller may legitimately narrow a list
 * down to just this team — an Admin/Super Admin, or a CRM lead. Mirrors
 * socialMediaTeamOnlyScopeFor exactly; used for the `scope=crm` query param
 * on Leads/Tasks/Meetings/Projects/Calls.
 */
export async function crmTeamOnlyScopeFor(user: PermissionUser): Promise<string[] | null> {
  const membership = await getCrmMembership(user.id);
  if (isCrmLead(user, membership)) {
    // isCrmLead can also be true for an admin with no department-of-the-team
    // of their own — only prefer the caller's department for a genuine lead.
    return getCrmTeamUserIds(membership?.isLead ? user.departmentId : undefined);
  }
  // A genuine member who isn't a lead still gets their own records, same as
  // the main (non-team) Leads/Tasks/Meetings/Projects pages already show
  // them — only non-members get shut out entirely.
  return membership ? [user.id] : null;
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
 * CRM Team member plus admins — rather than a global event every connected
 * client would receive regardless of access.
 */
export async function broadcastCrmChange(event: string, payload: unknown) {
  await broadcastTeamChangeBySlug(TEAM_SLUG, event, payload);
}
