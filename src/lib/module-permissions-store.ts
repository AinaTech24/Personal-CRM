import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { MODULE_KEYS } from "@/lib/modules";
import {
  MANAGED_MODULES,
  hasModuleAction,
  NO_MODULE_ACCESS,
  type ManagedModule,
  type ModuleAction,
  type ModulePermissionFlags,
} from "@/lib/module-permissions";

/** Company-wide "Sidebar modules" hide list (Admin > Settings) — the same column /api/module-visibility reads. */
export async function getHiddenModules(): Promise<string[]> {
  const s = await db.appSettings.findUnique({ where: { id: "default" }, select: { hiddenModules: true } });
  const raw = s?.hiddenModules;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string" && MODULE_KEYS.includes(v)) : [];
}

/**
 * For the three toggleable modules with no Permission Manager grant at all
 * (Quotations, Invoices, Passwords — not in MANAGED_MODULES, so
 * isModuleBlocked doesn't apply to them) — whether the company-wide hide
 * list covers `toggleKey` for this person. Always false for an admin;
 * nothing can override it for anyone else, since there's no grant to widen
 * past it in the first place.
 */
export async function isUngrantedModuleHidden(user: PermissionUser, toggleKey: string): Promise<boolean> {
  if (isAdmin(user)) return false;
  return (await getHiddenModules()).includes(toggleKey);
}

/**
 * The nav href key (TOGGLEABLE_MODULES, modules.ts) a Permission Manager
 * module maps to, for modules the company-wide hide list can also reach —
 * same pairing sidebar.tsx's MAIN_NAV_HREF_MODULE uses, kept here instead
 * since this file (unlike that one) is already server-only.
 */
// CLIENTS is deliberately excluded: isModuleBlocked's single boolean answer
// is shared by three different access paths to the same page (a CLIENTS
// grant, CRM Team membership, and Social Media's own team access), and the
// hide list's documented rule only ever suppresses the first two — Social
// Media keeps its own Clients view regardless (see the "Sidebar modules"
// help text and sidebar.tsx's crmExtras/restrictToSocialMedia split). That
// needs the caller's own context, so it's handled directly in
// clients/page.tsx and the clients API routes instead of in here.
const MANAGED_MODULE_TOGGLE_KEY: Partial<Record<ManagedModule, string>> = {
  LEADS: "leads",
  TASKS: "tasks",
  PROJECTS: "projects",
  MEETINGS: "meetings",
  ATTENDANCE: "attendance",
  NOTES: "notes",
  MESSAGES: "messages",
  BIRTHDAYS: "birthdays",
  LEAVE: "leave",
  EXPENSES: "expenses",
};

/**
 * Modules where holding an individual grant still gets you in even though
 * the module is hidden company-wide — mirrors sidebar.tsx's
 * MAIN_NAV_HREF_MODULE (a grant widening past the default also widens past a
 * hide, since both are "something made this person's access wider than the
 * company default"). Clients is the deliberate exception even among these:
 * hiding it always wins over a grant there, same as the sidebar's nav filter.
 */
const HIDE_OVERRIDABLE_BY_GRANT = new Set<ManagedModule>(["LEADS", "TASKS", "PROJECTS", "MEETINGS", "ATTENDANCE", "NOTES"]);

/** This user's full grant matrix — every module, defaulting to no access where no row exists. For the Permission Manager UI. */
export async function getUserModuleMatrix(userId: string): Promise<Record<ManagedModule, ModulePermissionFlags>> {
  const rows = await db.userModulePermission.findMany({ where: { userId } });
  const byModule = new Map(rows.map((r) => [r.module, r]));
  const matrix = {} as Record<ManagedModule, ModulePermissionFlags>;
  for (const moduleKey of MANAGED_MODULES) {
    const row = byModule.get(moduleKey);
    matrix[moduleKey] = row
      ? {
          canCreate: row.canCreate,
          canRead: row.canRead,
          canUpdate: row.canUpdate,
          canDelete: row.canDelete,
          blocked: row.blocked,
          allDepartments: row.allDepartments,
        }
      : { ...NO_MODULE_ACCESS };
  }
  return matrix;
}

/** Every module this user holds at least one action on (an Admin has all of them regardless, but isn't included here — callers already check isAdmin separately). */
export async function getUserModulePermissions(userId: string): Promise<ManagedModule[]> {
  const rows = await db.userModulePermission.findMany({
    where: { userId, OR: [{ canCreate: true }, { canRead: true }, { canUpdate: true }, { canDelete: true }] },
    select: { module: true },
  });
  return rows.map((r) => r.module);
}

/**
 * Every module an admin has explicitly blocked for this person (see
 * ModulePermissionFlags.blocked) — never includes anyone who's simply never
 * been touched in Permission Manager, since that state has no row at all.
 * The sidebar uses this (via /api/module-visibility) to hide a module's nav
 * link outright. For Tasks/Projects/Leads/Meetings/Clients, the relevant
 * list/detail/create/update/delete routes separately call the single-module
 * isModuleBlocked() below to actually deny the data too, not just the nav
 * link — unlike the company-wide "Sidebar modules" hide, which only ever
 * affects the sidebar. Messages is page-gated only (see its page.tsx) since
 * conversations are membership-based, not ownership-based.
 */
export async function getBlockedModules(userId: string): Promise<ManagedModule[]> {
  const rows = await db.userModulePermission.findMany({ where: { userId, blocked: true }, select: { module: true } });
  return rows.map((r) => r.module);
}

/** Whether this user may perform `action` on `module`, granted individually rather than through role or department. */
export async function canManageModule(user: PermissionUser, module: ManagedModule, action: ModuleAction): Promise<boolean> {
  if (isAdmin(user)) return true;
  const row = await db.userModulePermission.findUnique({ where: { userId_module: { userId: user.id, module } } });
  if (!row) return false;
  return hasModuleAction(row, action);
}

/**
 * How far a module grant widens this user's record visibility for a
 * list/scope query — the intended hierarchy is company Admin (everything)
 * above a company-wide grant (everything, same breadth as an Admin, but for
 * one module only) above a department-scoped grant (everything in their own
 * department) above an ungranted user (their own records only, handled by
 * the caller's existing own-record fallback, not by this function).
 *
 * A module grant from the Permission Manager is deliberately NOT a
 * company-wide bypass for anyone but a real company Admin by default — it's
 * how a department's lead gets full CRUD over their own department's
 * records (Tasks, Leads, Meetings, Projects, Clients, Attendance, Leave),
 * mirroring the Department Admin / Department User hierarchy. The grant's
 * own `allDepartments` flag (admin-only to set — see the Permission
 * Manager's PUT handler) is the deliberate exception: it lets a company
 * Admin hand one person admin-level visibility into one specific module
 * without making them a full Admin. A grant holder with no department of
 * their own, and no `allDepartments`, has nothing to scope to, so this
 * returns null — same as not holding the grant at all; the caller's
 * own-record fallback still applies.
 */
export async function moduleAccessScope(
  user: PermissionUser,
  module: ManagedModule,
  action: ModuleAction
): Promise<"all" | { departmentId: string } | null> {
  if (isAdmin(user)) return "all";
  const row = await db.userModulePermission.findUnique({ where: { userId_module: { userId: user.id, module } } });
  if (!row || !hasModuleAction(row, action)) return null;
  if (row.allDepartments) return "all";
  return user.departmentId ? { departmentId: user.departmentId } : null;
}

/**
 * Whether this person is denied `module` outright — a real access denial,
 * not just a nav hide: callers short-circuit to "forbidden"/empty on true,
 * before even their own baseline own-record access would otherwise apply.
 * Always false for an admin. True for either of two independent reasons:
 *
 * - An admin explicitly blocked this one person in Permission Manager
 *   (ModulePermissionFlags.blocked).
 * - The company-wide "Sidebar modules" hide list (Admin > Settings) covers
 *   this module and this person has nothing that widens past the default —
 *   same rule sidebar.tsx's nav filter already uses to decide visibility,
 *   applied here so hiding a module is a real restriction and not just a
 *   cosmetic one the nav and the data disagree about.
 */
export async function isModuleBlocked(user: PermissionUser, module: ManagedModule): Promise<boolean> {
  if (isAdmin(user)) return false;
  const row = await db.userModulePermission.findUnique({
    where: { userId_module: { userId: user.id, module } },
    select: { blocked: true, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
  });
  if (row?.blocked) return true;

  const toggleKey = MANAGED_MODULE_TOGGLE_KEY[module];
  if (toggleKey) {
    const hidden = await getHiddenModules();
    if (hidden.includes(toggleKey)) {
      const hasGrant = !!row && (row.canCreate || row.canRead || row.canUpdate || row.canDelete);
      if (!(HIDE_OVERRIDABLE_BY_GRANT.has(module) && hasGrant)) return true;
    }
  }
  return false;
}

/** Whether this user holds any module grant at all — the floor for reaching the /admin pages that a grant (not just company-admin) can unlock. */
export async function hasAnyModulePermission(userId: string): Promise<boolean> {
  const row = await db.userModulePermission.findFirst({
    where: { userId, OR: [{ canCreate: true }, { canRead: true }, { canUpdate: true }, { canDelete: true }] },
    select: { id: true },
  });
  return !!row;
}

export interface ModuleGrantee {
  userId: string;
  flags: ModulePermissionFlags;
}

/** Every user holding at least one action on `module`, for the Permission Manager's "by module" view — the reverse of getUserModuleMatrix. Admins aren't included; they implicitly have every module regardless of any row. */
export async function getModuleGrantees(module: ManagedModule): Promise<ModuleGrantee[]> {
  const rows = await db.userModulePermission.findMany({
    where: { module, OR: [{ canCreate: true }, { canRead: true }, { canUpdate: true }, { canDelete: true }] },
  });
  return rows.map((r) => ({
    userId: r.userId,
    flags: {
      canCreate: r.canCreate,
      canRead: r.canRead,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      blocked: r.blocked,
      allDepartments: r.allDepartments,
    },
  }));
}

/** Replaces this user's full grant matrix with exactly `matrix` — every module gets an explicit row, even an all-false one, so the Permission Manager always reflects exactly what was saved. */
export async function setUserModuleMatrix(userId: string, matrix: Record<ManagedModule, ModulePermissionFlags>) {
  await db.$transaction(
    MANAGED_MODULES.map((module) =>
      db.userModulePermission.upsert({
        where: { userId_module: { userId, module } },
        create: { userId, module, ...matrix[module] },
        update: { ...matrix[module] },
      })
    )
  );
}
