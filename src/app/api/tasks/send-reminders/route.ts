import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { notifyUser } from "@/lib/notify";
import { sendPushToUsers } from "@/lib/push";

/**
 * Fires every Task whose remindAt has passed and hasn't been sent yet —
 * both an in-app toast/bell (notifyUser) and a real OS-level push
 * (sendPushToUsers) — to whoever the task is currently assigned to.
 * Unassigned tasks are marked sent without notifying anyone; there's no one
 * to remind. Same two ways in as the meeting/attendance reminder routes: an
 * admin trigger for testing, or a scheduler with the CRON_SECRET header for
 * the real schedule.
 *
 * Idempotent via a persisted reminderSentAt (see meetings/send-reminders
 * for why that's used here instead of the in-memory rate-limit.ts trick
 * attendance reminders rely on).
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const due = await db.task.findMany({
    where: { remindAt: { lte: new Date() }, reminderSentAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: { id: true, title: true, assignedToId: true, assignees: { select: { id: true } } },
  });

  let sent = 0;

  for (const task of due) {
    const assigneeIds = [...new Set([...task.assignees.map((a) => a.id), ...(task.assignedToId ? [task.assignedToId] : [])])];
    for (const assigneeId of assigneeIds) {
      // notifyUser returns null when that assignee has the "tasks" category
      // turned off in Settings — push should be muted right along with it.
      const notification = await notifyUser(assigneeId, "task_reminder", { taskId: task.id, taskTitle: task.title });
      if (notification) {
        await sendPushToUsers([assigneeId], {
          title: "Task reminder",
          body: `"${task.title}" needs your attention.`,
          url: "/tasks",
          tag: "task-reminder",
        });
        sent += 1;
      }
    }

    await db.task.update({ where: { id: task.id }, data: { reminderSentAt: new Date() } });
  }

  return NextResponse.json({ checked: due.length, sent });
}
