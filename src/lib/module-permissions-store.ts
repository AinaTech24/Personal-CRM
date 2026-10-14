import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import type { ManagedModule } from "@/lib/module-permissions";

/** Every module explicitly granted to this user (an Admin has all of them regardless, but isn't included here — callers already check isAdmin separately). */
export async function getUserModulePermissions(userId: string): Promise<ManagedModule[]> {
  const rows = await db.userModulePermission.findMany({ where: { userId }, select: { module: true } });
  return rows.map((r) => r.module);
}

/** Admin-equivalent access to one module, granted individually rather than through role or department. */
export async function canManageModule(user: PermissionUser, module: ManagedModule): Promise<boolean> {
  if (isAdmin(user)) return true;
  const row = await db.userModulePermission.findUnique({ where: { userId_module: { userId: user.id, module } } });
  return !!row;
}

/** Whether this user holds any module grant at all — the floor for reaching the /admin pages that a grant (not just company-admin) can unlock. */
export async function hasAnyModulePermission(userId: string): Promise<boolean> {
  const row = await db.userModulePermission.findFirst({ where: { userId }, select: { id: true } });
  return !!row;
}

/** Replaces this user's full set of granted modules with exactly `modules`. */
export async function setUserModulePermissions(userId: string, modules: ManagedModule[]) {
  await db.$transaction([
    db.userModulePermission.deleteMany({ where: { userId } }),
    ...(modules.length > 0
      ? [db.userModulePermission.createMany({ data: modules.map((module) => ({ userId, module })) })]
      : []),
  ]);
}
