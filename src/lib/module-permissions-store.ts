import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import {
  MANAGED_MODULES,
  hasModuleAction,
  NO_MODULE_ACCESS,
  type ManagedModule,
  type ModuleAction,
  type ModulePermissionFlags,
} from "@/lib/module-permissions";

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
 * Whether an admin has explicitly blocked `module` for this person (see
 * ModulePermissionFlags.blocked) — a real access denial, not just a nav
 * hide: callers short-circuit to "forbidden"/empty on true, before even
 * their own baseline own-record access would otherwise apply. Always false
 * for an admin.
 */
export async function isModuleBlocked(user: PermissionUser, module: ManagedModule): Promise<boolean> {
  if (isAdmin(user)) return false;
  const row = await db.userModulePermission.findUnique({
    where: { userId_module: { userId: user.id, module } },
    select: { blocked: true },
  });
  return row?.blocked ?? false;
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
