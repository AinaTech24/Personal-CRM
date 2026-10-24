import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { USER_ROLES, type Actor, type UserRole } from "./access";

const WORKSPACE_SLUG = "aina";
let workspaceIdCache: string | null = null;

/** The single internal Aina workspace (spec: "One internal Aina workspace; extensible"), created on first use. */
export async function workspaceId(): Promise<string> {
  if (workspaceIdCache) return workspaceIdCache;
  const existing = await db.ccWorkspace.findUnique({ where: { slug: WORKSPACE_SLUG }, select: { id: true } });
  if (existing) return (workspaceIdCache = existing.id);
  try {
    const created = await db.ccWorkspace.create({
      data: { slug: WORKSPACE_SLUG, name: "Aina Tech Services LLP", status: "active" },
      select: { id: true },
    });
    return (workspaceIdCache = created.id);
  } catch {
    // Another request created it concurrently.
    const again = await db.ccWorkspace.findUniqueOrThrow({ where: { slug: WORKSPACE_SLUG }, select: { id: true } });
    return (workspaceIdCache = again.id);
  }
}

async function resolve(userId: string, name: string, companyRole: string | null): Promise<Actor> {
  const ws = await workspaceId();
  const now = new Date();
  const [assignments, member, grants] = await Promise.all([
    db.ccRoleAssignment.findMany({
      where: { workspaceId: ws, userId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      select: { role: true },
    }),
    db.ccTeamMember.findFirst({ where: { workspaceId: ws, authUserId: userId, archivedAt: null }, select: { id: true } }),
    db.ccClientAccessGrant.findMany({
      where: { workspaceId: ws, userId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { mfdOrgId: true },
    }),
  ]);
  const roles = new Set<UserRole>();
  for (const a of assignments) if ((USER_ROLES as readonly string[]).includes(a.role)) roles.add(a.role as UserRole);
  if (companyRole === "SUPER_ADMIN") roles.add("platform_admin");
  if (companyRole === "ADMIN") roles.add("aina_admin");
  return {
    userId,
    name,
    workspaceId: ws,
    roles,
    memberId: member?.id ?? null,
    grantedOrgIds: new Set(grants.map((g) => g.mfdOrgId)),
  };
}

/** The signed-in user as a Command Centre actor, or null when not signed in. */
export async function getActor(): Promise<Actor | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return resolve(user.id, [user.name, user.surname].filter(Boolean).join(" "), user.role);
}

/**
 * Automations act with the triggering user's identity (so audit attributes
 * the change to them) but full rights, since the trigger was already
 * authorized when it was written.
 */
export async function systemActor(userId: string): Promise<Actor> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
  const a = await resolve(userId, [user?.name, user?.surname].filter(Boolean).join(" ") || "Automation", null);
  a.roles = new Set<UserRole>(["platform_admin"]);
  return a;
}

/** Whether this user should see the Command Centre at all (sidebar, page gate). */
export async function hasCommandCentreAccess(userId: string, companyRole: string): Promise<boolean> {
  if (companyRole === "SUPER_ADMIN" || companyRole === "ADMIN") return true;
  const ws = await workspaceId();
  const now = new Date();
  const n = await db.ccRoleAssignment.count({
    where: { workspaceId: ws, userId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
  });
  return n > 0;
}
