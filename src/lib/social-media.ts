import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import { canAccessSocialClient, type SocialMembership } from "@/lib/social-media-permissions";

export type { SocialMembership };
export {
  hasSocialMediaAccess,
  isSocialMediaLead,
  socialClientListWhere,
  canAccessSocialClient,
} from "@/lib/social-media-permissions";

/** The current user's Social Media membership row, or null if they have none (and aren't a company admin). */
export async function getSocialMembership(userId: string): Promise<SocialMembership | null> {
  return db.socialMediaMember.findUnique({ where: { userId }, select: { isLead: true } });
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
