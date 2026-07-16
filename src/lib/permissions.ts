import type { Role } from "@/generated/prisma/enums";

export interface PermissionUser {
  id: string;
  role: Role;
  departmentId: string | null;
}

export function isSuperAdmin(user: PermissionUser) {
  return user.role === "SUPER_ADMIN";
}

export function isAdmin(user: PermissionUser) {
  return user.role === "ADMIN" || isSuperAdmin(user);
}

export function canManageDepartments(user: PermissionUser) {
  return isSuperAdmin(user);
}

export function canManageUsers(user: PermissionUser) {
  return isAdmin(user);
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

export function canManageRecord(
  user: PermissionUser,
  record: { createdById: string; assignedToId?: string | null; departmentId?: string | null }
) {
  if (isAdmin(user)) return canAccessDepartmentRecord(user, record.departmentId);
  return (
    record.createdById === user.id ||
    record.assignedToId === user.id ||
    canAccessDepartmentRecord(user, record.departmentId)
  );
}

/** Prisma `where` clause fragment to scope department-owned records to what this user may see. */
export function departmentScopeWhere(user: PermissionUser) {
  if (isSuperAdmin(user)) return {};
  if (user.role === "ADMIN") return {};
  return {
    OR: [{ departmentId: user.departmentId }, { departmentId: null }],
  };
}
