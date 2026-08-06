import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { keyFromDate } from "@/lib/attendance";
import { buildAttendanceWhere } from "@/lib/attendance-query";
import { getSocialMembership, getSocialMediaTeamUserIds, isSocialMediaLead } from "@/lib/social-media";

/**
 * The Social Media Team console's own version of /api/attendance — same
 * filters, but hard-scoped to the Social Media team's own user ids via an
 * AND clause rather than trusting a `userId` query param. Used both by a
 * non-admin Social Media lead (who has no other way to see their team's
 * attendance) and by a company Admin/Super Admin viewing the Team console
 * (who could see everyone via /api/attendance, but this tab is specifically
 * the team-scoped view) — so a lead can never widen this into "everyone's
 * attendance" by hand-editing the request, while an admin still gets the
 * narrower, team-only list this tab promises.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getSocialMembership(user.id);
  if (!isAdmin(user) && !isSocialMediaLead(user, membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamUserIds = await getSocialMediaTeamUserIds();
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
