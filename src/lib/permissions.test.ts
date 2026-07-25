import { describe, expect, it } from "vitest";
import {
  isSuperAdmin,
  isAdmin,
  canAccessDepartmentRecord,
  canManageRecord,
  departmentScopeWhere,
  type PermissionUser,
} from "./permissions";

function user(overrides: Partial<PermissionUser> = {}): PermissionUser {
  return { id: "u1", role: "DEPARTMENT_USER", departmentId: "dept-a", ...overrides };
}

describe("isSuperAdmin / isAdmin", () => {
  it("only SUPER_ADMIN is a super admin", () => {
    expect(isSuperAdmin(user({ role: "SUPER_ADMIN" }))).toBe(true);
    expect(isSuperAdmin(user({ role: "ADMIN" }))).toBe(false);
    expect(isSuperAdmin(user({ role: "DEPARTMENT_USER" }))).toBe(false);
  });

  it("ADMIN and SUPER_ADMIN both count as admin", () => {
    expect(isAdmin(user({ role: "ADMIN" }))).toBe(true);
    expect(isAdmin(user({ role: "SUPER_ADMIN" }))).toBe(true);
    expect(isAdmin(user({ role: "DEPARTMENT_USER" }))).toBe(false);
  });
});

describe("canAccessDepartmentRecord", () => {
  it("a super admin can access any department's record", () => {
    const u = user({ role: "SUPER_ADMIN", departmentId: "dept-a" });
    expect(canAccessDepartmentRecord(u, "dept-b")).toBe(true);
  });

  it("an unowned record (null department) is visible to everyone", () => {
    expect(canAccessDepartmentRecord(user({ departmentId: "dept-a" }), null)).toBe(true);
    expect(canAccessDepartmentRecord(user({ departmentId: "dept-a" }), undefined)).toBe(true);
  });

  it("a department user can only reach their own department's record", () => {
    const u = user({ role: "DEPARTMENT_USER", departmentId: "dept-a" });
    expect(canAccessDepartmentRecord(u, "dept-a")).toBe(true);
    expect(canAccessDepartmentRecord(u, "dept-b")).toBe(false);
  });
});

describe("canManageRecord", () => {
  it("an admin scoped to the record's department can manage it regardless of ownership", () => {
    const admin = user({ id: "admin1", role: "ADMIN", departmentId: "dept-a" });
    const record = { createdById: "someone-else", assignedToId: null, departmentId: "dept-a" };
    expect(canManageRecord(admin, record)).toBe(true);
  });

  it("an admin outside the record's department cannot manage it", () => {
    const admin = user({ id: "admin1", role: "ADMIN", departmentId: "dept-a" });
    const record = { createdById: "someone-else", assignedToId: null, departmentId: "dept-b" };
    expect(canManageRecord(admin, record)).toBe(false);
  });

  it("a non-admin can manage a record they created", () => {
    const u = user({ id: "u1", departmentId: "dept-a" });
    const record = { createdById: "u1", assignedToId: null, departmentId: "dept-b" };
    expect(canManageRecord(u, record)).toBe(true);
  });

  it("a non-admin can manage a record they're assigned to, even from another department", () => {
    const u = user({ id: "u1", departmentId: "dept-a" });
    const record = { createdById: "someone-else", assignedToId: "u1", departmentId: "dept-b" };
    expect(canManageRecord(u, record)).toBe(true);
  });

  it("a non-admin who neither created nor is assigned the record falls back to department scope", () => {
    const u = user({ id: "u1", departmentId: "dept-a" });
    const sameDept = { createdById: "other", assignedToId: "other2", departmentId: "dept-a" };
    const otherDept = { createdById: "other", assignedToId: "other2", departmentId: "dept-b" };
    expect(canManageRecord(u, sameDept)).toBe(true);
    expect(canManageRecord(u, otherDept)).toBe(false);
  });
});

describe("departmentScopeWhere", () => {
  it("imposes no filter for admins", () => {
    expect(departmentScopeWhere(user({ role: "SUPER_ADMIN" }))).toEqual({});
    expect(departmentScopeWhere(user({ role: "ADMIN" }))).toEqual({});
  });

  it("scopes a department user to their own department plus unowned records", () => {
    const u = user({ role: "DEPARTMENT_USER", departmentId: "dept-a" });
    expect(departmentScopeWhere(u)).toEqual({
      OR: [{ departmentId: "dept-a" }, { departmentId: null }],
    });
  });
});
