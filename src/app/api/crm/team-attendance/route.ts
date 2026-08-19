import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { keyFromDate } from "@/lib/attendance";
import { buildAttendanceWhere } from "@/lib/attendance-query";
import { getCrmMembership, getCrmTeamUserIds, isCrmLead } from "@/lib/crm-team";

/**
 * The CRM Team console's own version of /api/attendance — same filters, but
 * hard-scoped to the CRM team's own user ids via an AND clause rather than
 * trusting a `userId` query param. Mirrors /api/social/team-attendance.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getCrmMembership(user.id);
  if (!isAdmin(user) && !isCrmLead(user, membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamUserIds = await getCrmTeamUserIds();
  const baseWhere = buildAttendanceWhere(req.nextUrl.searchParams);
  const where: Prisma.AttendanceWhereInput = { AND: [baseWhere, { userId: { in: teamUserIds } }] };

  const rows = await db.attendance.findMany({
    where,
    include: { user: { select: { id: true, name: true, surname: true, email: true } } },
    orderBy: [{ date: "desc" }, { user: { name: "asc" } }],
    take: 1000,
  });

  return NextResponse.json({
    records: rows.map((r) => ({
      id: r.id,
      user: r.user,
      date: keyFromDate(r.date),
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      workedMinutes: r.workedMinutes,
      status: r.status,
      calculatedStatus: r.calculatedStatus,
      statusOverride: r.statusOverride,
      overrideReason: r.overrideReason,
      halfDayReason: r.halfDayReason,
      adminNote: r.adminNote,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt,
    })),
  });
}
