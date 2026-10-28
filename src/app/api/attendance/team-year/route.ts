import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { istDateKey, dateFromKey, keyFromDate } from "@/lib/attendance";
import { adminAttendanceAccessScope } from "@/lib/attendance-query";

/** Admin (company-wide) or a Department Admin (their own department) only — per-day team attendance counts for a year, for the Administration page's overview heatmap. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await adminAttendanceAccessScope(user);
  if (scope === null) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : Number(istDateKey().slice(0, 4));
  const gte = dateFromKey(`${year}-01-01`);
  const lte = dateFromKey(`${year}-12-31`);

  const [rows, holidays] = await Promise.all([
    db.attendance.findMany({
      where: { date: { gte, lte }, ...(scope === "all" ? {} : { user: { departmentId: scope.departmentId } }) },
      select: { date: true, status: true, approvalStatus: true },
    }),
    db.holiday.findMany({ where: { date: { gte, lte } }, orderBy: { date: "asc" } }),
  ]);

  // Aggregate each day across all users. Rejected records don't count; a record
  // that's still pending (or has no finalized status) is surfaced as Pending.
  const map = new Map<string, { present: number; halfDay: number; absent: number; pending: number }>();
  for (const r of rows) {
    if (r.approvalStatus === "REJECTED") continue;
    const key = keyFromDate(r.date);
    let d = map.get(key);
    if (!d) {
      d = { present: 0, halfDay: 0, absent: 0, pending: 0 };
      map.set(key, d);
    }
    if (r.approvalStatus === "PENDING" || r.status === null) d.pending += 1;
    else if (r.status === "PRESENT") d.present += 1;
    else if (r.status === "HALF_DAY") d.halfDay += 1;
    else if (r.status === "ABSENT") d.absent += 1;
  }

  return NextResponse.json({
    year,
    todayKey: istDateKey(),
    days: [...map.entries()].map(([date, c]) => ({ date, ...c })),
    holidays: holidays.map((h) => ({ date: keyFromDate(h.date), name: h.name })),
  });
}
