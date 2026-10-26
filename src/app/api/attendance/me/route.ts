import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAttendancePolicy, getHolidayKeys } from "@/lib/attendance-settings";
import { istDateKey, dateFromKey, keyFromDate, summarize } from "@/lib/attendance";
import { isModuleBlocked } from "@/lib/module-permissions-store";

/** The signed-in user's own attendance for a year: records, summary, today, and the policy/holidays the calendar needs. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "ATTENDANCE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : Number(istDateKey().slice(0, 4));

  const rows = await db.attendance.findMany({
    where: { userId: user.id, date: { gte: dateFromKey(`${year}-01-01`), lte: dateFromKey(`${year}-12-31`) } },
    orderBy: { date: "asc" },
  });

  const records = rows.map((r) => ({
    date: keyFromDate(r.date),
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    breakIn: r.breakIn,
    breakMinutes: r.breakMinutes,
    workedMinutes: r.workedMinutes,
    status: r.status,
    calculatedStatus: r.calculatedStatus,
    statusOverride: r.statusOverride,
    halfDayReason: r.halfDayReason,
    approvalStatus: r.approvalStatus,
  }));

  const [policy, holidayKeys] = await Promise.all([getAttendancePolicy(), getHolidayKeys()]);
  const holidays = await db.holiday.findMany({
    where: { date: { gte: dateFromKey(`${year}-01-01`), lte: dateFromKey(`${year}-12-31`) } },
    orderBy: { date: "asc" },
  });

  const todayKey = istDateKey();
  const today = records.find((r) => r.date === todayKey) ?? null;

  return NextResponse.json({
    year,
    todayKey,
    records,
    today,
    summary: summarize(rows),
    policy: { fullDayMinutes: policy.fullDayMinutes, halfDayMinutes: policy.halfDayMinutes, workingWeekdays: policy.workingWeekdays },
    holidays: holidays.map((h) => ({ date: keyFromDate(h.date), name: h.name })),
    holidayCount: holidayKeys.size,
  });
}
