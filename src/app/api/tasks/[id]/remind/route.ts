import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTaskForUser } from "@/lib/tasks";
import { notifyAndPush } from "@/lib/notify";

/**
 * An on-demand nudge, separate from the scheduled reminderAt-based
 * send-reminders cron — for anyone who can already see this task (its
 * creator/assignee, an admin, a Tasks module grant, or a Social Media lead
 * covering it) to ping the assignee right now, not just wait for a reminder
 * time that may never have been set.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await getTaskForUser(user, id, "UPDATE");
  if (task === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assigneeIds = [...new Set([...task.assignees.map((a) => a.id), ...(task.assignedToId ? [task.assignedToId] : [])])];
  if (assigneeIds.length === 0) return NextResponse.json({ error: "This task has no assignee to remind." }, { status: 400 });

  await Promise.all(
    assigneeIds.map((aid) =>
      notifyAndPush(
        aid,
        "task_reminder",
        { taskId: task.id, taskTitle: task.title, actorName: user.name },
        { title: "Task reminder", body: `${user.name} nudged you about "${task.title}"`, url: "/tasks", tag: "task-reminder" }
      )
    )
  );

  return NextResponse.json({ ok: true });
}
