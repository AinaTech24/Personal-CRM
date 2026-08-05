import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";

/**
 * Pure scoping/permission logic for the Social Media module, kept apart from
 * social-media.ts deliberately — that file imports db.ts, which eagerly
 * builds a Prisma client from DATABASE_URL, so anything importing it can't
 * be unit tested without a live database configured. These have no such
 * dependency (same split as src/lib/credentials.ts vs src/lib/auth.ts).
 */

export interface SocialMembership {
  isLead: boolean;
}

/** Can this user see the Social Media module at all? Company admins always can, without needing a membership row. */
export function hasSocialMediaAccess(user: PermissionUser, membership: SocialMembership | null): boolean {
  return isAdmin(user) || !!membership;
}

/** Sees and manages every client, not just their own — company admins and members flagged as lead. */
export function isSocialMediaLead(user: PermissionUser, membership: SocialMembership | null): boolean {
  return isAdmin(user) || !!membership?.isLead;
}

/**
 * A Social Media team member (regular or lead) who ISN'T also a company
 * Admin/Super Admin. Their nav and access are restricted to the curated
 * Social Media set of modules (Dashboard/Tasks/Leads/Clients/Meetings/
 * Messages/Content Calendar/My Attendance) — company admins always see
 * everything, even if they also happen to hold a membership row.
 */
export function isSocialMediaOnlyUser(user: PermissionUser, membership: SocialMembership | null): boolean {
  return !isAdmin(user) && !!membership;
}

/** A client is visible to a lead/admin unconditionally; a regular member only sees what they created or are assigned. */
export function socialClientListWhere(user: PermissionUser, membership: SocialMembership | null) {
  if (isSocialMediaLead(user, membership)) return {};
  return { OR: [{ createdById: user.id }, { assignedToId: user.id }] };
}

export function canAccessSocialClient(
  user: PermissionUser,
  membership: SocialMembership | null,
  client: { createdById: string; assignedToId: string | null }
): boolean {
  if (isSocialMediaLead(user, membership)) return true;
  return client.createdById === user.id || client.assignedToId === user.id;
}
