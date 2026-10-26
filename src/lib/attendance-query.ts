import type { Prisma } from "@/generated/prisma/client";
import { dateFromKey } from "@/lib/attendance";
import { isAdmin, isDepartmentAdmin, type PermissionUser } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";

const STATUSES = ["PRESENT", "HALF_DAY", "ABSENT"];
const APPROVALS = ["PENDING", "APPROVED", "REJECTED"];

/**
 * How far this user's Attendance access reaches: "all" for an Admin or a
 * company-wide grant, their own department for a department-scoped grant —
 * or, same exception Notes already makes, a Department Admin's own
 * department even with no Permission Manager grant at all. A grant never
 * narrows this floor, only widens past it (e.g. to "all" via allDepartments).
 * null means no access whatsoever.
 */
export async function attendanceAccessScope(
  user: PermissionUser,
  action: ModuleAction
): Promise<"all" | { departmentId: string } | null> {
  if (isAdmin(user)) return "all";
  const granted = await moduleAccessScope(user, "ATTENDANCE", action);
  if (granted) return granted;
  if (isDepartmentAdmin(user) && user.departmentId) return { departmentId: user.departmentId };
  return null;
}

/**
 * Shared filter builder for the admin attendance list and its CSV export.
 * `scope` (from attendanceAccessScope) narrows the result to one department
 * when it isn't "all" — an Admin (or a company-wide grant) passes "all" for
 * the unrestricted view.
 */
export function buildAttendanceWhere(
  params: URLSearchParams,
  scope?: "all" | { departmentId: string } | null
): Prisma.AttendanceWhereInput {
  const where: Prisma.AttendanceWhereInput = {};

  const userId = params.get("userId");
  if (userId) where.userId = userId;

  const status = params.get("status");
  if (status && STATUSES.includes(status)) where.status = status as Prisma.AttendanceWhereInput["status"];

  const approval = params.get("approval");
  if (approval && APPROVALS.includes(approval)) {
    where.approvalStatus = approval as Prisma.AttendanceWhereInput["approvalStatus"];
  }

  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = dateFromKey(from);
    if (to) where.date.lte = dateFromKey(to);
  }

  const q = params.get("q")?.trim();
  if (q || (scope && typeof scope === "object")) {
    where.user = {
      ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }] }),
      ...(scope && typeof scope === "object" && { departmentId: scope.departmentId }),
    };
  }

  return where;
}
