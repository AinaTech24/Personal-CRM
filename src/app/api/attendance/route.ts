import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { keyFromDate } from "@/lib/attendance";
import { buildAttendanceWhere } from "@/lib/attendance-query";

/** Admin: attendance across all users, filterable by user, date range, status, approval, and free-text name/email. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = buildAttendanceWhere(req.nextUrl.searchParams);
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
