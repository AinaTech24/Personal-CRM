import type { Prisma } from "@/generated/prisma/client";
import { dateFromKey } from "@/lib/attendance";

const STATUSES = ["PRESENT", "HALF_DAY", "ABSENT"];
const APPROVALS = ["PENDING", "APPROVED", "REJECTED"];

/** Shared filter builder for the admin attendance list and its CSV export. */
export function buildAttendanceWhere(params: URLSearchParams): Prisma.AttendanceWhereInput {
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
  if (q) {
    where.user = { OR: [{ name: { contains: q } }, { email: { contains: q } }] };
  }

  return where;
}
