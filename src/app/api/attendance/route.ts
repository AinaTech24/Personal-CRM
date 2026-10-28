import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { keyFromDate } from "@/lib/attendance";
import { adminAttendanceAccessScope, buildAttendanceWhere } from "@/lib/attendance-query";

/** Admin (company-wide) or a Department Admin (their own department) only — the Administration page, not the Team console's own attendance view. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await adminAttendanceAccessScope(user);
  if (scope === null) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = buildAttendanceWhere(req.nextUrl.searchParams, scope);
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
      breakIn: r.breakIn,
      breakMinutes: r.breakMinutes,
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
