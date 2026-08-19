import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";

/**
 * Pure scoping/permission logic for the CRM Team module — same split and
 * same shape as social-media-permissions.ts, kept apart from crm-team.ts
 * (which imports db.ts and so can't be unit tested without a live database).
 */

export interface CrmMembership {
  isLead: boolean;
}

/** Can this user see the CRM Team module at all? Company admins always can, without needing a membership row. */
export function hasCrmAccess(user: PermissionUser, membership: CrmMembership | null): boolean {
  return isAdmin(user) || !!membership;
}

/** Sees and manages every CRM record, not just their own — company admins and members flagged as lead. */
export function isCrmLead(user: PermissionUser, membership: CrmMembership | null): boolean {
  return isAdmin(user) || !!membership?.isLead;
}

/**
 * A CRM Team member (regular or lead) who ISN'T also a company Admin/Super
 * Admin — company admins always see everything, even if they also happen to
 * hold a membership row.
 */
export function isCrmOnlyUser(user: PermissionUser, membership: CrmMembership | null): boolean {
  return !isAdmin(user) && !!membership;
}
