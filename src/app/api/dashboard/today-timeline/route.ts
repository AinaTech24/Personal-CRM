import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { istDayBoundsUtc, istWeekBoundsUtc, istMonthBoundsUtc, istDateKey } from "@/lib/attendance";

type ViewMode = "today" | "yesterday" | "week" | "month";

/** The window + day-grid for each view. Today/Yesterday are single-day grids; Week/Month are multi-day. */
function windowFor(view: ViewMode): { start: Date; end: Date; days: string[] } {
  if (view === "month") return istMonthBoundsUtc();
  if (view === "week") return istWeekBoundsUtc();
  const at = view === "yesterday" ? new Date(Date.now() - 24 * 60 * 60_000) : new Date();
  const { start, end } = istDayBoundsUtc(at);
  return { start, end, days: [istDateKey(at)] };
}

/**
 * One row per active user — company-wide for an Admin/Super Admin, their own
 * department only for a Department Admin. `?view=today|yesterday|week|month`
 * (default "week") picks the window; the client does all the layout math
 * (hourly add/due/completed markers for Today/Yesterday, day-bars for
 * Week/Month) against the raw task fields returned here.
 *
 * Today/Yesterday: every task with an `added`, `due`, or `completed` event
 * landing in that single day.
 *
 * Week/Month: every task whose bar (created date → due date, or →
 * completedAt once it has one) overlaps the displayed range — a task due
 * within it outright, or one still IN_PROGRESS/REVIEW regardless of how old
 * its due date is, since an open task's bar keeps growing toward today
 * rather than stopping at its due date.
 *
 * A task with several assignees appears under every one of them, same as
 * the task board itself treats "my tasks."
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user) && !isDepartmentAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewParam = req.nextUrl.searchParams.get("view");
  const view: ViewMode = viewParam === "today" || viewParam === "yesterday" || viewParam === "month" ? viewParam : "week";
  const { start, end, days } = windowFor(view);

  const isDayView = view === "today" || view === "yesterday";
  const taskWhere: Prisma.TaskWhereInput = isDayView
    ? {
        deletedAt: null,
        OR: [{ createdAt: { gte: start, lt: end } }, { dueDate: { gte: start, lt: end } }, { completedAt: { gte: start, lt: end } }],
      }
    : {
        deletedAt: null,
        dueDate: { not: null },
        createdAt: { lt: end },
        // A task whose own due date falls on/after this range is relevant
        // outright; one still open (IN_PROGRESS/REVIEW) stays relevant
        // regardless of how old its due date is, since its bar keeps growing
        // toward today until it's actually marked Completed.
        OR: [{ dueDate: { gte: start } }, { status: { in: ["IN_PROGRESS", "REVIEW"] } }],
      };

  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...(isAdmin(user) ? {} : { departmentId: user.departmentId }),
    },
    select: {
      id: true,
      name: true,
      surname: true,
      avatarDataUrl: true,
      department: { select: { name: true } },
      tasksAssignedTo: {
        where: taskWhere,
        select: { id: true, title: true, dueDate: true, createdAt: true, completedAt: true, priority: true, status: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({
    view,
    days,
    users: users.map((u) => ({
      id: u.id,
      name: [u.name, u.surname].filter(Boolean).join(" "),
      avatarDataUrl: u.avatarDataUrl,
      department: u.department?.name ?? null,
      tasks: u.tasksAssignedTo.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
        priority: t.priority,
        status: t.status,
      })),
    })),
  });
}
