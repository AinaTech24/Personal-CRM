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
      ? { canCreate: row.canCreate, canRead: row.canRead, canUpdate: row.canUpdate, canDelete: row.canDelete }
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

/** Whether this user may perform `action` on `module`, granted individually rather than through role or department. */
export async function canManageModule(user: PermissionUser, module: ManagedModule, action: ModuleAction): Promise<boolean> {
  if (isAdmin(user)) return true;
  const row = await db.userModulePermission.findUnique({ where: { userId_module: { userId: user.id, module } } });
  if (!row) return false;
  return hasModuleAction(row, action);
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
    flags: { canCreate: r.canCreate, canRead: r.canRead, canUpdate: r.canUpdate, canDelete: r.canDelete },
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
