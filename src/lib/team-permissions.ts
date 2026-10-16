import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";

/**
 * Pure scoping/permission logic for the generic Teams module, kept apart
 * from teams.ts (which imports db.ts and so can't be unit tested without a
 * live database) — same split as social-media-permissions.ts/crm-permissions.ts.
 */

export interface TeamMembership {
  isLead: boolean;
}

/** Sees and manages every member of the team — company admins and members flagged as lead. */
export function isTeamLead(user: PermissionUser, membership: TeamMembership | null): boolean {
  return isAdmin(user) || !!membership?.isLead;
}

/**
 * Who may open a team's console to manage its members and their
 * permissions: a company Admin for any team, or that team's own lead for
 * their team — mirrors canManagePermissionsFor's Department Admin precedent
 * in src/lib/permissions.ts. Never a regular (non-lead) member.
 */
export function canManageTeam(actor: PermissionUser, actorMembership: TeamMembership | null): boolean {
  return isTeamLead(actor, actorMembership);
}
