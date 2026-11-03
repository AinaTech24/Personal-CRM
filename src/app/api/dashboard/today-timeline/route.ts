import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { istWeekBoundsUtc } from "@/lib/attendance";

/**
 * One row per active user — company-wide for an Admin/Super Admin, their
 * own department only for a Department Admin — each carrying the tasks
 * whose bar (created date → due date) overlaps the current IST week, so the
 * dashboard can lay them out as a weekly Gantt-style timeline. A task with
 * several assignees appears under every one of them, same as the task board
 * itself treats "my tasks."
 *
 * A task still IN_PROGRESS or REVIEW past its due date keeps its bar
 * growing — one column further for every day it stays open — instead of
 * stopping dead at the original due date; `days` is what the client lays
 * its columns out against, and "today" (computed client-side) is where that
 * growing edge currently is.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user) && !isDepartmentAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { start, end, days } = istWeekBoundsUtc();

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
          dueDate: { not: null },
          createdAt: { lt: end },
          // A task whose own due date falls on/after this week is relevant
          // outright; one still open (IN_PROGRESS/REVIEW) stays relevant
          // regardless of how old its due date is, since its bar keeps
          // growing toward today until it's actually marked Completed.
          OR: [{ dueDate: { gte: start } }, { status: { in: ["IN_PROGRESS", "REVIEW"] } }],
        },
        select: { id: true, title: true, dueDate: true, createdAt: true, priority: true, status: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({
    days,
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
      })),
    })),
  });
}
