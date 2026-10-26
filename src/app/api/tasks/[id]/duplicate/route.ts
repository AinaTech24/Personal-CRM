import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastTaskChange, getTaskForUser } from "@/lib/tasks";
import { notifyAndPush } from "@/lib/notify";

const taskInclude = {
  assignedTo: { select: { id: true, name: true } },
  assignees: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true, attachments: true } },
};

/**
 * Duplicates a task as a new one owned by whoever duplicated it — same
 * title (suffixed), description, priority, due date, and assignees as the
 * source, but a fresh TODO status and no reminder, comments, or
 * attachments carried over. Same access as editing the source task, since
 * seeing it well enough to copy it is the same bar.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getTaskForUser(user, id, "UPDATE");
  if (existing === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assigneeIds = existing.assignees.map((a) => a.id);

  const task = await db.task.create({
    data: {
      title: `${existing.title} (Copy)`,
      description: existing.description,
      priority: existing.priority,
      status: "TODO",
      dueDate: existing.dueDate,
      assignedToId: assigneeIds[0] ?? null,
      assignees: { connect: assigneeIds.map((aid) => ({ id: aid })) },
      createdById: user.id,
    },
    include: taskInclude,
  });

  await Promise.all(
    assigneeIds
      .filter((aid) => aid !== user.id)
      .map((aid) =>
        notifyAndPush(
          aid,
          "task_assigned",
          { taskId: task.id, taskTitle: task.title, actorName: user.name },
          { title: "Task assigned", body: `${user.name} assigned you the task "${task.title}"`, url: "/tasks", tag: "task-assigned" }
        )
      )
  );

  broadcastTaskChange("task_created", task);

  return NextResponse.json({ task }, { status: 201 });
}
