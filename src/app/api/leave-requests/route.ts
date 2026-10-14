import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { dateFromKey, istDateKey } from "@/lib/attendance";
import { leaveSummary, leaveWorkingDays } from "@/lib/leave";
import { leaveRequestInclude, serializeLeaveRequest } from "@/lib/leave-requests";
import { notifyAndPush } from "@/lib/notify";
import { emitToAdmins } from "@/lib/socket-emit";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

/**
 * Your own requests plus your dashboard numbers. `?scope=all` (admins only)
 * returns everyone's, optionally narrowed with `?status=`.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  if (params.get("scope") === "all") {
    if (!isAdmin(user) && !(await canManageModule(user, "LEAVE"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const status = STATUSES.find((s) => s === params.get("status"));
    const rows = await db.leaveRequest.findMany({
      where: status ? { status } : {},
      include: leaveRequestInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({ requests: rows.map(serializeLeaveRequest) });
  }

  const year = Number(istDateKey().slice(0, 4));
  const [rows, summary] = await Promise.all([
    db.leaveRequest.findMany({ where: { userId: user.id }, include: leaveRequestInclude, orderBy: { createdAt: "desc" }, take: 200 }),
    leaveSummary(user.id, year),
  ]);
  return NextResponse.json({ requests: rows.map(serializeLeaveRequest), summary, year });
}

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bodySchema = z.object({
  category: z.enum(["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"]),
  startDate: dateKey,
  endDate: dateKey,
  isHalfDay: z.boolean().default(false),
  reason: z.string().trim().min(1).max(1000),
});

/** Apply for leave. Duration is worked out here from the working calendar, not taken from the client. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
  const d = parsed.data;

  if (Number.isNaN(dateFromKey(d.startDate).getTime()) || Number.isNaN(dateFromKey(d.endDate).getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (d.endDate < d.startDate) return NextResponse.json({ error: "End date can't be before the start date." }, { status: 400 });
  if (d.isHalfDay && d.startDate !== d.endDate) {
    return NextResponse.json({ error: "A half day must be a single date." }, { status: 400 });
  }

  const workingDays = await leaveWorkingDays(d.startDate, d.endDate);
  if (workingDays.length === 0) {
    return NextResponse.json({ error: "That range has no working days (Sundays and holidays don't count)." }, { status: 400 });
  }

  const overlap = await db.leaveRequest.findFirst({
    where: {
      userId: user.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateFromKey(d.endDate) },
      endDate: { gte: dateFromKey(d.startDate) },
    },
    select: { id: true },
  });
  if (overlap) return NextResponse.json({ error: "You already have a leave request covering some of these dates." }, { status: 409 });

  const created = await db.leaveRequest.create({
    data: {
      userId: user.id,
      category: d.category,
      startDate: dateFromKey(d.startDate),
      endDate: dateFromKey(d.endDate),
      isHalfDay: d.isHalfDay,
      days: d.isHalfDay ? 0.5 : workingDays.length,
      reason: d.reason,
    },
    include: leaveRequestInclude,
  });

  // Tell every other active admin there is something to decide.
  const admins = await db.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] }, NOT: { id: user.id } },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) =>
      notifyAndPush(
        a.id,
        "leave_requested",
        { requestId: created.id, actorName: user.name },
        { title: "New leave request", body: `${user.name} applied for leave`, url: "/admin/leave", tag: "leave-requested" }
      )
    )
  );
  emitToAdmins("leave_request_changed", { id: created.id });

  return NextResponse.json({ request: serializeLeaveRequest(created) }, { status: 201 });
}
