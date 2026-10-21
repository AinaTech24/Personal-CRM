import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { keyFromDate } from "@/lib/attendance";
import { buildAttendanceWhere } from "@/lib/attendance-query";
import { getUserTeamMembership, getTeamUserIds } from "@/lib/teams";

/**
 * Any (non-system) team's own version of /api/attendance — same filters,
 * hard-scoped to this team's own user ids via an AND clause. Mirrors
 * /api/crm/team-attendance and /api/social/team-attendance, generalized to
 * an arbitrary team id instead of a fixed slug.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getUserTeamMembership(id, user.id);
  if (!isAdmin(user) && !membership?.isLead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prefer the caller's own department when they're a genuine lead (not an
  // admin peeking in, who has no department-of-the-team of their own) — see
  // getTeamUserIds's comment for why this matters with 2+ leads.
  const teamUserIds = await getTeamUserIds(id, membership?.isLead ? user.departmentId : undefined);
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
