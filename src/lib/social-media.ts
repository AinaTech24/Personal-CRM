import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { canAccessSocialClient, isSocialMediaLead, isSocialMediaOnlyUser, socialClientListWhere, type SocialMembership } from "@/lib/social-media-permissions";
import { moduleAccessScope, isModuleBlocked, getHiddenModules, canManageModule } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
import { getTeamMembershipBySlug, getTeamUserIdsBySlug, broadcastTeamChangeBySlug } from "@/lib/teams";
import { getCrmMembership, hasCrmAccess } from "@/lib/crm-team";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

/** The "Social Media" row in the generic Team table (seeded by scripts/migrate-social-crm-to-teams.ts) that this module reads/writes through — see the Teams unification plan. */
const TEAM_SLUG = "social-media";

export type { SocialMembership };
export {
  hasSocialMediaAccess,
  isSocialMediaLead,
  isSocialMediaOnlyUser,
  socialClientListWhere,
  canAccessSocialClient,
} from "@/lib/social-media-permissions";

/** The current user's Social Media membership, or null if they have none (and aren't a company admin), reading through the generic Team/TeamMember tables. */
export async function getSocialMembership(userId: string): Promise<SocialMembership | null> {
  return getTeamMembershipBySlug(userId, TEAM_SLUG);
}

/**
 * Every user id currently on the Social Media team, restricted to those
 * actually IN the Social Media department — not just anyone with a
 * membership row. "Add an existing user" on the Members tab lets an admin
 * add literally anyone company-wide, e.g. a Sales rep given one-off access
 * to review a client's content; that person joining the team shouldn't mean
 * THEIR OWN unrelated Sales leads/tasks/meetings/attendance start showing
 * up in this team's aggregate views. This is what every current caller
 * (team-attendance, team-activity, and both scope-widening/narrowing
 * helpers below) actually wants; nothing needs the unfiltered roster.
 */
export async function getSocialMediaTeamUserIds(preferredDepartmentId?: string | null): Promise<string[]> {
  return getTeamUserIdsBySlug(TEAM_SLUG, preferredDepartmentId);
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
  // isAdmin already returned above, so passing isSocialMediaLead here means
  // this is a genuine lead membership row — prefer their own department
  // over an arbitrary lead's (see getTeamUserIdsBySlug's comment).
  return getSocialMediaTeamUserIds(user.departmentId);
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
  if (isSocialMediaLead(user, membership)) {
    // Unlike socialMediaTeamScopeFor, isSocialMediaLead here can also be
    // true for a company Admin peeking at the team-only view — an admin has
    // no department-of-the-team of their own, so only prefer the caller's
    // department when membership says they're a genuine lead.
    return getSocialMediaTeamUserIds(membership?.isLead ? user.departmentId : undefined);
  }
  // A genuine member who isn't a lead still gets their own records, same as
  // the main (non-team) Leads/Tasks/Meetings/Projects pages already show
  // them — only non-members get shut out entirely.
  return membership ? [user.id] : null;
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
 * A CRM Team member (regular or lead, not a company admin) can look up any
 * client in their own department — the same department-scoped visibility a
 * Permission Manager CLIENTS grant would give, but automatic for the whole
 * team instead of needing an explicit grant row per person. Deliberately
 * READ-only (see getSocialClientForUser) — referencing a client for CRM's
 * own Leads/Quotations work doesn't need CRM able to edit Social Media's
 * own client records; that still requires an explicit grant, same as before.
 */
export async function crmClientsScopeFor(user: PermissionUser): Promise<{ departmentId: string } | null> {
  if (isAdmin(user)) return null;
  const membership = await getCrmMembership(user.id);
  if (!hasCrmAccess(user, membership)) return null;
  return user.departmentId ? { departmentId: user.departmentId } : null;
}

/**
 * Looks up a client and checks access in one round trip — mirrors
 * getProjectForUser/getTaskForUser's "forbidden vs not found vs record"
 * three-way return so callers can distinguish a real 404 from a visibility
 * block without a second query.
 */
/**
 * `action` is READ for viewing (the default — also what every client
 * sub-resource route, content/ads/platforms/folders/reports, checks through
 * here, since they don't separately distinguish their own CRUD level yet)
 * or UPDATE for editing the client record itself.
 */
export async function getSocialClientForUser(
  user: PermissionUser,
  membership: SocialMembership | null,
  clientId: string,
  action: Extract<ModuleAction, "READ" | "UPDATE"> = "READ"
) {
  const client = await db.socialClient.findUnique({
    where: { id: clientId },
    include: { createdBy: { select: { departmentId: true } }, assignedTo: { select: { departmentId: true } } },
  });
  if (!client || client.deletedAt) return null;
  if (await isModuleBlocked(user, "CLIENTS")) return "forbidden" as const;
  if (canAccessSocialClient(user, membership, client)) return client;

  // The company-wide "Sidebar modules" hide (Admin > Settings) only ever
  // suppresses the grant- and CRM-Team-based paths below — a genuine Social
  // Media team member's own access, just checked above, is never subject to
  // it. isAdmin(user) isn't checked separately here: an admin's grant check
  // (moduleAccessScope) already returns "all" regardless of the hide list.
  if ((await getHiddenModules()).includes("clients") && !isAdmin(user)) return "forbidden" as const;

  const scope = await moduleAccessScope(user, "CLIENTS", action);
  if (scope === "all") return client;
  if (scope && (client.createdBy.departmentId === scope.departmentId || client.assignedTo?.departmentId === scope.departmentId)) {
    return client;
  }

  if (action === "READ") {
    const crmScope = await crmClientsScopeFor(user);
    if (crmScope && (client.createdBy.departmentId === crmScope.departmentId || client.assignedTo?.departmentId === crmScope.departmentId)) {
      return client;
    }
  }

  return "forbidden" as const;
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
  if (!content || content.deletedAt) return null;
  const client = await getSocialClientForUser(user, membership, content.clientId);
  if (client === "forbidden" || !client) return client;
  return content;
}

/** Same parent-client-inherited access pattern as getSocialContentForUser, for ad campaigns. */
export async function getSocialAdForUser(user: PermissionUser, membership: SocialMembership | null, adId: string) {
  const ad = await db.socialAdCampaign.findUnique({ where: { id: adId } });
  if (!ad || ad.deletedAt) return null;
  const client = await getSocialClientForUser(user, membership, ad.clientId);
  if (client === "forbidden" || !client) return client;
  return ad;
}

/** Same parent-client-inherited access pattern as getSocialContentForUser, for monthly reports. */
export async function getSocialReportForUser(user: PermissionUser, membership: SocialMembership | null, reportId: string) {
  const report = await db.socialMonthlyReport.findUnique({ where: { id: reportId } });
  if (!report || report.deletedAt) return null;
  const client = await getSocialClientForUser(user, membership, report.clientId);
  if (client === "forbidden" || !client) return client;
  return report;
}

/** Same parent-client-inherited access pattern as getSocialContentForUser, for the Files tab's folders. */
export async function getSocialFolderForUser(user: PermissionUser, membership: SocialMembership | null, folderId: string) {
  const folder = await db.socialClientFolder.findUnique({ where: { id: folderId } });
  if (!folder) return null;
  const client = await getSocialClientForUser(user, membership, folder.clientId);
  if (client === "forbidden" || !client) return client;
  return folder;
}

/**
 * Images live inside a folder rather than directly under a client, so this
 * checks the folder's own client-inherited access rather than duplicating
 * it — same shape as getSocialContentForUser, one hop deeper.
 */
export async function getSocialImageForUser(user: PermissionUser, membership: SocialMembership | null, imageId: string) {
  const image = await db.socialClientImage.findUnique({ where: { id: imageId } });
  if (!image) return null;
  const folder = await getSocialFolderForUser(user, membership, image.folderId);
  if (folder === "forbidden" || !folder) return folder;
  return image;
}

export async function logSocialClientActivity(clientId: string, actorId: string, action: string, meta?: object) {
  await db.socialClientActivity.create({ data: { clientId, actorId, action, meta } });
}

/* ------------------------------- Trash ------------------------------- */

/**
 * Deletion is a lead/admin action across Clients, Content, and Ad Campaigns —
 * see each live DELETE route's own comment. Checks the company-wide CLIENTS
 * block first, same as getSocialClientForUser, so an explicitly blocked user
 * can't reach Trash actions through a stale permission-row grant.
 */
async function canManageSocialTrash(user: PermissionUser, membership: SocialMembership | null): Promise<boolean> {
  if (await isModuleBlocked(user, "CLIENTS")) return false;
  return isSocialMediaLead(user, membership) || (await canManageModule(user, "CLIENTS", "DELETE"));
}

/** Every trashed client this user is allowed to manage. */
export async function listTrashedSocialClientsFor(user: PermissionUser): Promise<TrashItem[]> {
  const membership = await getSocialMembership(user.id);
  if (!(await canManageSocialTrash(user, membership))) return [];
  const clients = await db.socialClient.findMany({
    where: { deletedAt: { not: null } },
    include: { deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return clients.map((c) => ({
    id: c.id,
    module: "socialClients",
    moduleLabel: "Social Media Clients",
    title: c.name,
    subtitle: c.companyName,
    deletedAt: c.deletedAt!.toISOString(),
    deletedBy: c.deletedBy,
    expiresAt: trashExpiresAt(c.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the client back exactly as it was. */
export async function restoreSocialClient(user: PermissionUser, clientId: string): Promise<TrashActionResult> {
  const membership = await getSocialMembership(user.id);
  if (!(await canManageSocialTrash(user, membership))) return "forbidden";
  const client = await db.socialClient.findUnique({ where: { id: clientId } });
  if (!client || !client.deletedAt) return "not_found";

  await db.socialClient.update({ where: { id: clientId }, data: { deletedAt: null, deletedById: null } });
  await broadcastSocialChange("social_client_created", { clientId });
  return "ok";
}

/** Same permission as deleting it in the first place — cascades to its content/ads/reports, like the live DELETE route. */
export async function purgeSocialClient(user: PermissionUser, clientId: string): Promise<TrashActionResult> {
  const membership = await getSocialMembership(user.id);
  if (!(await canManageSocialTrash(user, membership))) return "forbidden";
  const client = await db.socialClient.findUnique({ where: { id: clientId } });
  if (!client || !client.deletedAt) return "not_found";

  await db.socialClient.delete({ where: { id: clientId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredSocialClients(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.socialClient.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}

/** Every trashed content item under a client this user is allowed to manage. */
export async function listTrashedSocialContentFor(user: PermissionUser): Promise<TrashItem[]> {
  const membership = await getSocialMembership(user.id);
  if (!(await canManageSocialTrash(user, membership))) return [];
  // canManageSocialTrash's grant check is company-wide (not department-scoped),
  // so a grant holder needs that same breadth reflected here — otherwise
  // they'd pass the gate above but still only see content under clients
  // they personally created or are assigned to.
  const scope = await moduleAccessScope(user, "CLIENTS", "DELETE");
  const items = await db.socialContentItem.findMany({
    where: { deletedAt: { not: null }, client: socialClientListWhere(user, membership, scope) },
    include: { deletedBy: { select: { id: true, name: true } }, client: { select: { name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return items.map((c) => ({
    id: c.id,
    module: "socialContent",
    moduleLabel: "Social Media Content",
    title: c.title,
    subtitle: c.client.name,
    deletedAt: c.deletedAt!.toISOString(),
    deletedBy: c.deletedBy,
    expiresAt: trashExpiresAt(c.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the content item back exactly as it was. */
export async function restoreSocialContent(user: PermissionUser, contentId: string): Promise<TrashActionResult> {
  const content = await db.socialContentItem.findUnique({ where: { id: contentId } });
  if (!content || !content.deletedAt) return "not_found";
  const membership = await getSocialMembership(user.id);
  const client = await getSocialClientForUser(user, membership, content.clientId);
  if (client === "forbidden" || !client) return "forbidden";
  if (!(await canManageSocialTrash(user, membership))) return "forbidden";

  await db.socialContentItem.update({ where: { id: contentId }, data: { deletedAt: null, deletedById: null } });
  await logSocialClientActivity(content.clientId, user.id, "content_restored", { contentId, title: content.title });
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeSocialContent(user: PermissionUser, contentId: string): Promise<TrashActionResult> {
  const content = await db.socialContentItem.findUnique({ where: { id: contentId } });
  if (!content || !content.deletedAt) return "not_found";
  const membership = await getSocialMembership(user.id);
  const client = await getSocialClientForUser(user, membership, content.clientId);
  if (client === "forbidden" || !client) return "forbidden";
  if (!(await canManageSocialTrash(user, membership))) return "forbidden";

  await db.socialContentItem.delete({ where: { id: contentId } });
  await logSocialClientActivity(content.clientId, user.id, "content_purged", { contentId, title: content.title });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredSocialContent(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.socialContentItem.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}

/** Every trashed ad campaign under a client this user is allowed to manage. */
export async function listTrashedSocialAdsFor(user: PermissionUser): Promise<TrashItem[]> {
  const membership = await getSocialMembership(user.id);
  if (!(await canManageSocialTrash(user, membership))) return [];
  // Same reasoning as listTrashedSocialContentFor — widen to the grant's
  // actual (company-wide) breadth instead of just this user's own clients.
  const scope = await moduleAccessScope(user, "CLIENTS", "DELETE");
  const ads = await db.socialAdCampaign.findMany({
    where: { deletedAt: { not: null }, client: socialClientListWhere(user, membership, scope) },
    include: { deletedBy: { select: { id: true, name: true } }, client: { select: { name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return ads.map((a) => ({
    id: a.id,
    module: "socialAds",
    moduleLabel: "Social Media Ads",
    title: a.name,
    subtitle: a.client.name,
    deletedAt: a.deletedAt!.toISOString(),
    deletedBy: a.deletedBy,
    expiresAt: trashExpiresAt(a.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the ad campaign back exactly as it was. */
export async function restoreSocialAd(user: PermissionUser, adId: string): Promise<TrashActionResult> {
  const ad = await db.socialAdCampaign.findUnique({ where: { id: adId } });
  if (!ad || !ad.deletedAt) return "not_found";
  const membership = await getSocialMembership(user.id);
  const client = await getSocialClientForUser(user, membership, ad.clientId);
  if (client === "forbidden" || !client) return "forbidden";
  if (!(await canManageSocialTrash(user, membership))) return "forbidden";

  await db.socialAdCampaign.update({ where: { id: adId }, data: { deletedAt: null, deletedById: null } });
  await logSocialClientActivity(ad.clientId, user.id, "ad_campaign_restored", { adId, name: ad.name });
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeSocialAd(user: PermissionUser, adId: string): Promise<TrashActionResult> {
  const ad = await db.socialAdCampaign.findUnique({ where: { id: adId } });
  if (!ad || !ad.deletedAt) return "not_found";
  const membership = await getSocialMembership(user.id);
  const client = await getSocialClientForUser(user, membership, ad.clientId);
  if (client === "forbidden" || !client) return "forbidden";
  if (!(await canManageSocialTrash(user, membership))) return "forbidden";

  await db.socialAdCampaign.delete({ where: { id: adId } });
  await logSocialClientActivity(ad.clientId, user.id, "ad_campaign_purged", { adId, name: ad.name });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredSocialAds(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.socialAdCampaign.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}

/**
 * Every trashed monthly report under a client this user can see — reports
 * have no lead/grant-only delete gate on the live route (unlike content/ads),
 * so this lists whatever the caller can otherwise access, not just what a
 * lead/grant holder could.
 */
export async function listTrashedSocialReportsFor(user: PermissionUser): Promise<TrashItem[]> {
  const membership = await getSocialMembership(user.id);
  const scope = await moduleAccessScope(user, "CLIENTS", "READ");
  const reports = await db.socialMonthlyReport.findMany({
    where: { deletedAt: { not: null }, client: socialClientListWhere(user, membership, scope) },
    include: { deletedBy: { select: { id: true, name: true } }, client: { select: { name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return reports.map((r) => ({
    id: r.id,
    module: "socialReports",
    moduleLabel: "Social Media Reports",
    title: r.title || `${r.client.name} — ${r.year}-${String(r.month).padStart(2, "0")}`,
    subtitle: r.client.name,
    deletedAt: r.deletedAt!.toISOString(),
    deletedBy: r.deletedBy,
    expiresAt: trashExpiresAt(r.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the report back exactly as it was. Same access as deleting it in the first place — just the parent client's. */
export async function restoreSocialReport(user: PermissionUser, reportId: string): Promise<TrashActionResult> {
  const report = await db.socialMonthlyReport.findUnique({ where: { id: reportId } });
  if (!report || !report.deletedAt) return "not_found";
  const membership = await getSocialMembership(user.id);
  const client = await getSocialClientForUser(user, membership, report.clientId);
  if (client === "forbidden" || !client) return "forbidden";

  await db.socialMonthlyReport.update({ where: { id: reportId }, data: { deletedAt: null, deletedById: null } });
  await logSocialClientActivity(report.clientId, user.id, "monthly_report_restored", { year: report.year, month: report.month });
  return "ok";
}

/** Same permission as deleting it in the first place — just the parent client's. */
export async function purgeSocialReport(user: PermissionUser, reportId: string): Promise<TrashActionResult> {
  const report = await db.socialMonthlyReport.findUnique({ where: { id: reportId } });
  if (!report || !report.deletedAt) return "not_found";
  const membership = await getSocialMembership(user.id);
  const client = await getSocialClientForUser(user, membership, report.clientId);
  if (client === "forbidden" || !client) return "forbidden";

  await db.socialMonthlyReport.delete({ where: { id: reportId } });
  await logSocialClientActivity(report.clientId, user.id, "monthly_report_purged", { year: report.year, month: report.month });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredSocialReports(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.socialMonthlyReport.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}

/**
 * Broadcasts to exactly who can see this module — every current Social
 * Media team member plus admins — rather than a global event every
 * connected client would receive regardless of access.
 */
export async function broadcastSocialChange(event: string, payload: unknown) {
  await broadcastTeamChangeBySlug(TEAM_SLUG, event, payload);
}
