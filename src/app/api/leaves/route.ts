import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { dateFromKey, keyFromDate } from "@/lib/attendance";

/** Admins see everyone's leave; a regular user sees only their own. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const where = {
    ...(isAdmin(user) ? {} : { userId: user.id }),
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
 * Admin: put a user on leave. Full-day leave also stamps that day's attendance
 * as Absent with the reason, so the record reflects it without any check-in.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;
  const date = dateFromKey(d.date);

  const leave = await db.userLeave.upsert({
    where: { userId_date: { userId: d.userId, date } },
    create: { userId: d.userId, date, type: d.type, reason: d.reason || null, createdById: user.id },
    update: { type: d.type, reason: d.reason || null },
    include: { user: { select: { id: true, name: true, surname: true, email: true } } },
  });

  if (d.type === "FULL_DAY") {
    const note = `On leave${d.reason ? ` — ${d.reason}` : ""}`;
    await db.attendance.upsert({
      where: { userId_date: { userId: d.userId, date } },
      create: {
        userId: d.userId,
        date,
        status: "ABSENT",
        calculatedStatus: "ABSENT",
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedById: user.id,
        adminNote: note,
      },
      update: {
        status: "ABSENT",
        statusOverride: true,
        overrideReason: note,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedById: user.id,
        adminNote: note,
      },
    });
  }

  return NextResponse.json(
    { leave: { id: leave.id, date: keyFromDate(leave.date), type: leave.type, reason: leave.reason, user: leave.user } },
    { status: 201 }
  );
}
