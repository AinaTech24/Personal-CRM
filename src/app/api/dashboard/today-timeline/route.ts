import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { istDayBoundsUtc } from "@/lib/attendance";

/**
 * One row per active user — company-wide for an Admin/Super Admin, their
 * own department only for a Department Admin — each carrying today's tasks
 * so the dashboard can place them on an hour-of-day strip. A task with
 * several assignees appears under every one of them, same as the task
 * board itself treats "my tasks."
 *
 * "Today's tasks" is every task due today, PLUS any still-open task
 * (IN_PROGRESS/REVIEW) whose due date has already passed — it keeps
 * showing up, day after day, until it's actually marked COMPLETED (or
 * CANCELLED), rather than silently dropping off the moment its due date
 * is behind it. `isCarriedOver` tells the UI which case it is, since a
 * carried-over task's "due" time is no longer today's.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user) && !isDepartmentAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { start, end } = istDayBoundsUtc();

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
        where: {
          deletedAt: null,
          OR: [
            { dueDate: { gte: start, lt: end } },
            { dueDate: { lt: start }, status: { in: ["IN_PROGRESS", "REVIEW"] } },
          ],
        },
        select: { id: true, title: true, dueDate: true, priority: true, status: true, createdAt: true },
        orderBy: { dueDate: "asc" },
      },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    users: users.map((u) => ({
      id: u.id,
      name: [u.name, u.surname].filter(Boolean).join(" "),
      avatarDataUrl: u.avatarDataUrl,
      department: u.department?.name ?? null,
      tasks: u.tasksAssignedTo.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!.toISOString(),
        createdAt: t.createdAt.toISOString(),
        priority: t.priority,
        status: t.status,
        isCarriedOver: t.dueDate! < start,
      })),
    })),
  });
}
