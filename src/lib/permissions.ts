import type { Role } from "@/generated/prisma/enums";

export interface PermissionUser {
  id: string;
  role: Role;
  departmentId: string | null;
  /** Admin of their own department (the one in `departmentId` above). Optional so narrow object literals built before this field existed still satisfy the type. */
  isDepartmentAdmin?: boolean;
}

export function isSuperAdmin(user: PermissionUser) {
  return user.role === "SUPER_ADMIN";
}

export function isAdmin(user: PermissionUser) {
  return user.role === "ADMIN" || isSuperAdmin(user);
}

/**
 * ADMIN and SUPER_ADMIN alike — matching every other admin-gated capability
 * in the app (Users & Invites, Permission Manager, Teams). The Departments
 * page's own create/rename/delete controls were already shown to any
 * `isAdmin(user)`; this used to be Super-Admin-only underneath, so a plain
 * Admin clicking those controls got a silent 403 despite seeing them.
 */
export function canManageDepartments(user: PermissionUser) {
  return isAdmin(user);
}

export function canManageUsers(user: PermissionUser) {
  return isAdmin(user);
}

/** Admin of their own department — can reach the Permission Manager for people in that one department, nothing else a company Admin can (roles, department moves, creating more department admins). */
export function isDepartmentAdmin(user: PermissionUser) {
  return !!user.isDepartmentAdmin && !!user.departmentId;
}

/**
 * Who may open the Permission Manager for `target`'s module grants: a
 * company Admin for anyone, or a Department Admin for someone sharing their
 * own department — never for themselves, so a Department Admin can't widen
 * their own access.
 */
export function canManagePermissionsFor(actor: PermissionUser, target: { id: string; departmentId: string | null }) {
  if (actor.id === target.id && !isAdmin(actor)) return false;
  if (isAdmin(actor)) return true;
  return isDepartmentAdmin(actor) && !!target.departmentId && actor.departmentId === target.departmentId;
}

export function canInviteUsers(user: PermissionUser) {
  return isAdmin(user);
}

export function canApproveQuotation(user: PermissionUser) {
  return isAdmin(user);
}

export function canAccessDepartmentRecord(
  user: PermissionUser,
  recordDepartmentId: string | null | undefined
) {
  if (isSuperAdmin(user)) return true;
  if (!recordDepartmentId) return true;
  return user.departmentId === recordDepartmentId;
}

/**
 * Default (no Permission Manager grant) management rights over a record: an
 * Admin within their department scope, or the record's own creator/assignee.
 * Sharing a department is NOT by itself enough — that used to grant every
 * department member implicit CRUD over everyone else's records, which made
 * the Permission Manager's per-module grants nearly pointless. Wider,
 * cross-department or whole-department access now only comes from an
 * explicit module grant (see canManageModule) or being an Admin.
 */
export function canManageRecord(
  user: PermissionUser,
  record: { createdById: string; assignedToId?: string | null; departmentId?: string | null }
) {
  if (isAdmin(user)) return canAccessDepartmentRecord(user, record.departmentId);
  return record.createdById === user.id || record.assignedToId === user.id;
}

/** Prisma `where` clause fragment to scope department-owned records to what this user may see. */
export function departmentScopeWhere(user: PermissionUser) {
  if (isSuperAdmin(user)) return {};
  if (user.role === "ADMIN") return {};
  return {
    OR: [{ departmentId: user.departmentId }, { departmentId: null }],
  };
}
