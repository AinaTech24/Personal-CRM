import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import { canAccessSocialClient, isSocialMediaLead, isSocialMediaOnlyUser, type SocialMembership } from "@/lib/social-media-permissions";

export type { SocialMembership };
export {
  hasSocialMediaAccess,
  isSocialMediaLead,
  isSocialMediaOnlyUser,
  socialClientListWhere,
  canAccessSocialClient,
} from "@/lib/social-media-permissions";

/** The current user's Social Media membership row, or null if they have none (and aren't a company admin). */
export async function getSocialMembership(userId: string): Promise<SocialMembership | null> {
  return db.socialMediaMember.findUnique({ where: { userId }, select: { isLead: true } });
}

/** Every user id currently on the Social Media team (regular members and leads alike). */
export async function getSocialMediaTeamUserIds(): Promise<string[]> {
  const members = await db.socialMediaMember.findMany({ select: { userId: true } });
  return members.map((m) => m.userId);
}

/**
 * The Social Media team's user ids, but only when this caller is a
 * team-scoped lead who isn't already a company Admin/Super Admin — a company
 * admin already sees everything unconditionally and doesn't need broadening,
 * and a regular (non-lead) member gets no broadening at all. Returns null
 * whenever there's nothing to widen the caller's own-record visibility with,
 * so call sites can treat null as "no team scoping applies here."
 */
export async function socialMediaTeamScopeFor(user: PermissionUser): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  const membership = await getSocialMembership(user.id);
  if (!isSocialMediaLead(user, membership)) return null;
  return getSocialMediaTeamUserIds();
}

/**
 * The Social Media team's user ids, when the caller may legitimately narrow
 * a list down to just this team — an Admin/Super Admin, or a Social Media
 * lead (isSocialMediaLead already treats any company admin as a lead, so
 * this covers both in one check). Returns null for anyone else.
 *
 * This is the inverse of socialMediaTeamScopeFor: that one *widens* a lead's
 * own-record visibility without touching an Admin's already-unrestricted
 * {} where-clause. This one *narrows* — it's for the Social Media Team
 * console's Leads/Tasks/Meetings/Projects tabs, which explicitly ask for the
 * team-only view via a `scope=social-media` query param. Without it, an
 * Admin opening those tabs would see every record in the company (their
 * normal, correct behavior everywhere else) instead of just this team's,
 * because their {} bypass has no team concept built in.
 */
export async function socialMediaTeamOnlyScopeFor(user: PermissionUser): Promise<string[] | null> {
  const membership = await getSocialMembership(user.id);
  if (!isSocialMediaLead(user, membership)) return null;
  return getSocialMediaTeamUserIds();
}

/**
 * Whether `user` may mark/edit/approve another user's attendance: a company
 * Admin/Super Admin always can (their existing, unrestricted access); a
 * Social Media lead can, but only for someone on their own team — attendance
 * has no other per-record ownership concept (no creator/assignee) to widen
 * from, so this checks team membership directly rather than reusing a
 * lib/attendance.ts helper the way leads/tasks/projects do.
 */
export async function canManageAttendanceFor(user: PermissionUser, targetUserId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const teamUserIds = await socialMediaTeamScopeFor(user);
  return !!teamUserIds && teamUserIds.includes(targetUserId);
}

/**
 * One-call guard for routes a Social Media team member (regular or lead,
 * not a company admin) shouldn't reach at all — e.g. Quotations. Does the
 * membership lookup itself so callers don't need getSocialMembership wired
 * through just for this check.
 */
export async function isRestrictedFromModule(user: PermissionUser): Promise<boolean> {
  const membership = await getSocialMembership(user.id);
  return isSocialMediaOnlyUser(user, membership);
}

/**
 * Looks up a client and checks access in one round trip — mirrors
 * getProjectForUser/getTaskForUser's "forbidden vs not found vs record"
 * three-way return so callers can distinguish a real 404 from a visibility
 * block without a second query.
 */
export async function getSocialClientForUser(user: PermissionUser, membership: SocialMembership | null, clientId: string) {
  const client = await db.socialClient.findUnique({ where: { id: clientId } });
  if (!client) return null;
  if (!canAccessSocialClient(user, membership, client)) return "forbidden" as const;
  return client;
}

/**
 * Content items, ad campaigns, and reports have no assignee of their own —
 * access is inherited from the parent client (see the schema comment on
 * SocialContentItem). This fetches the content item, then re-uses the same
 * client-access check every other client sub-resource route already goes
 * through, so a user can't reach a piece of content under a client they
 * can't otherwise see.
 */
export async function getSocialContentForUser(user: PermissionUser, membership: SocialMembership | null, contentId: string) {
  const content = await db.socialContentItem.findUnique({ where: { id: contentId } });
  if (!content) return null;
  const client = await getSocialClientForUser(user, membership, content.clientId);
  if (client === "forbidden" || !client) return client;
  return content;
}

/** Same parent-client-inherited access pattern as getSocialContentForUser, for ad campaigns. */
export async function getSocialAdForUser(user: PermissionUser, membership: SocialMembership | null, adId: string) {
  const ad = await db.socialAdCampaign.findUnique({ where: { id: adId } });
  if (!ad) return null;
  const client = await getSocialClientForUser(user, membership, ad.clientId);
  if (client === "forbidden" || !client) return client;
  return ad;
}

/** Same parent-client-inherited access pattern as getSocialContentForUser, for monthly reports. */
export async function getSocialReportForUser(user: PermissionUser, membership: SocialMembership | null, reportId: string) {
  const report = await db.socialMonthlyReport.findUnique({ where: { id: reportId } });
  if (!report) return null;
  const client = await getSocialClientForUser(user, membership, report.clientId);
  if (client === "forbidden" || !client) return client;
  return report;
}

export async function logSocialClientActivity(clientId: string, actorId: string, action: string, meta?: object) {
  await db.socialClientActivity.create({ data: { clientId, actorId, action, meta } });
}

/**
 * Broadcasts to exactly who can see this module — every current
 * SocialMediaMember plus admins — rather than a global event every
 * connected client would receive regardless of access. Membership is a
 * short list in practice, so one extra query per change is cheap.
 */
export async function broadcastSocialChange(event: string, payload: unknown) {
  emitToAdmins(event, payload);
  const members = await db.socialMediaMember.findMany({ select: { userId: true } });
  for (const m of members) emitToUser(m.userId, event, payload);
}
