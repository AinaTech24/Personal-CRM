import type { Role } from "@/generated/prisma/enums";

export interface PermissionUser {
  id: string;
  role: Role;
  departmentId: string | null;
  /**
   * Present when the caller loaded the department relation (e.g.
   * `getCurrentUser()`'s `include: { department: true }`) — omitted callers
   * simply never match `isAnalyst`/`canAccessClientsModule`, which is the
   * safe default.
   */
  department?: { isAnalystDept: boolean; hasClientsModule: boolean } | null;
}

export function isSuperAdmin(user: PermissionUser) {
  return user.role === "SUPER_ADMIN";
}

export function isAdmin(user: PermissionUser) {
  return user.role === "ADMIN" || isSuperAdmin(user);
}

/**
 * A member of a department flagged `isAnalystDept` (e.g. "Analyst") — sees
 * every department's leads/clients/tasks/meetings/projects the same way an
 * Admin does, but ONLY for reading: it deliberately does not grant
 * `isAdmin`-gated write/delete/manage capabilities. Call sites that widen a
 * list's `where` clause for Analysts must NOT also widen the corresponding
 * edit/delete check — see the guard this implies in each module's PATCH
 * route.
 */
export function isAnalyst(user: PermissionUser) {
  return user.department?.isAnalystDept === true;
}

/** An Analyst who is not also a company Admin — used to explicitly block edits that a widened read-scope would otherwise let through. */
export function isAnalystOnly(user: PermissionUser) {
  return !isAdmin(user) && isAnalyst(user);
}

/**
 * Whether `user` may reach the (Development-style) Clients module at all —
 * an Admin, an Analyst (read-only, same as every other module they see), or
 * a member of a department with `hasClientsModule` explicitly turned on via
 * the Departments admin page.
 */
export function canAccessClientsModule(user: PermissionUser) {
  return isAdmin(user) || isAnalyst(user) || user.department?.hasClientsModule === true;
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
