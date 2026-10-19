import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import { dateFromKey, keyFromDate } from "@/lib/attendance";
import { grantLeaveDay } from "@/lib/leave";

/** Admins see everyone's leave; an Attendance module grant sees their own department's; a regular user sees only their own. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "ATTENDANCE", "READ");

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const where = {
    ...(scope === "all" ? {} : scope ? { user: { departmentId: scope.departmentId } } : { userId: user.id }),
    ...(from || to
      ? { date: { ...(from ? { gte: dateFromKey(from) } : {}), ...(to ? { lte: dateFromKey(to) } : {}) } }
      : {}),
  };

  const rows = await db.userLeave.findMany({
    where,
    include: { user: { select: { id: true, name: true, surname: true, email: true } } },
    orderBy: { date: "desc" },
    take: 300,
  });

  return NextResponse.json({
    leaves: rows.map((l) => ({
      id: l.id,
      date: keyFromDate(l.date),
      type: l.type,
      reason: l.reason,
      user: l.user,
    })),
  });
}

const bodySchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["FULL_DAY", "HALF_DAY"]).default("FULL_DAY"),
  reason: z.string().max(300).optional().nullable(),
});

/**
 * Admin (anyone), or an Attendance module grant (their own department
 * only): put a user on leave. Full-day leave also stamps that day's
 * attendance as Absent with the reason, so the record reflects it without
 * any check-in.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "ATTENDANCE", "CREATE");
  if (scope === null) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  if (scope !== "all") {
    const target = await db.user.findUnique({ where: { id: d.userId }, select: { departmentId: true } });
    if (!target || target.departmentId !== scope.departmentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const leave = await grantLeaveDay({
    userId: d.userId,
    dateKey: d.date,
    type: d.type,
    reason: d.reason || null,
    actorId: user.id,
  });

  return NextResponse.json(
    { leave: { id: leave.id, date: keyFromDate(leave.date), type: leave.type, reason: leave.reason, user: leave.user } },
    { status: 201 }
  );
}
