import type { PermissionUser } from "@/lib/permissions";
import { socialMediaTeamOnlyScopeFor, socialMediaTeamScopeFor } from "@/lib/social-media";
import { crmTeamOnlyScopeFor, crmTeamScopeFor } from "@/lib/crm-team";
import { teamOnlyScopeFor } from "@/lib/teams";

/**
 * Widens the caller's own-record visibility to their team, trying Social
 * Media first then CRM — a user is never a lead of both in practice, so at
 * most one of these ever returns non-null. Returns null for anyone who
 * isn't a team lead of either (including a company admin, who doesn't need
 * widening — their access is already unrestricted).
 */
export async function combinedTeamScopeFor(user: PermissionUser): Promise<string[] | null> {
  const social = await socialMediaTeamScopeFor(user);
  if (social) return social;
  return crmTeamScopeFor(user);
}

/**
 * Resolves the `scope` query param shared by Leads/Tasks/Meetings/Projects —
 * "social-media" or "crm" explicitly asks for that team's narrower,
 * team-only view (teamOnly: true); `team:<id>` asks the same for any other
 * (non-system) team's own console; omitted, it instead widens the caller's
 * own-record visibility to their team via combinedTeamScopeFor.
 */
export async function resolveTeamScope(
  user: PermissionUser,
  scopeParam: string | null
): Promise<{ teamOnly: boolean; teamUserIds: string[] | null }> {
  if (scopeParam === "social-media") return { teamOnly: true, teamUserIds: await socialMediaTeamOnlyScopeFor(user) };
  if (scopeParam === "crm") return { teamOnly: true, teamUserIds: await crmTeamOnlyScopeFor(user) };
  if (scopeParam?.startsWith("team:")) {
    return { teamOnly: true, teamUserIds: await teamOnlyScopeFor(user, scopeParam.slice("team:".length)) };
  }
  return { teamOnly: false, teamUserIds: await combinedTeamScopeFor(user) };
}
