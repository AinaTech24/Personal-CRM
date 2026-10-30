import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastTaskChange, canDeleteTask, getTaskForUser } from "@/lib/tasks";
import { notifyAndPush } from "@/lib/notify";
import { emitToUser } from "@/lib/socket-emit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      assignees: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        omit: { data: true }, // never ship the base64 blob in the list payload
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({ task });
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"]).optional(),
  dueDate: z.string().nullable().optional(),
  /** The full replacement assignee list — omit to leave assignment untouched, pass (possibly empty) to replace it entirely. */
  assigneeIds: z.array(z.string()).optional(),
  remindAt: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id, "UPDATE");
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;
  const before = access;
  const beforeAssigneeIds = new Set([...before.assignees.map((a) => a.id), ...(before.assignedToId ? [before.assignedToId] : [])]);
  const assigneeIds = data.assigneeIds !== undefined ? [...new Set(data.assigneeIds)] : undefined;

  const task = await db.task.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      ...(assigneeIds !== undefined && {
        assignedToId: assigneeIds[0] ?? null,
        assignees: { set: assigneeIds.map((aid) => ({ id: aid })) },
      }),
      // A changed (or cleared) reminder time is a fresh reminder — reset the
      // sent flag too, so moving it doesn't just silently skip firing.
      ...(data.remindAt !== undefined && {
        remindAt: data.remindAt ? new Date(data.remindAt) : null,
        reminderSentAt: null,
      }),
    },
    include: { assignees: { select: { id: true } } },
  });

  if (assigneeIds !== undefined) {
    const newlyAdded = assigneeIds.filter((aid) => !beforeAssigneeIds.has(aid) && aid !== user.id);
    await Promise.all(
      newlyAdded.map((aid) =>
        notifyAndPush(
          aid,
          "task_assigned",
          { taskId: id, taskTitle: task.title, actorName: user.name },
          { title: "Task assigned", body: `${user.name} assigned you the task "${task.title}"`, url: "/tasks", tag: "task-assigned" }
        )
      )
    );
  }

  broadcastTaskChange("task_updated", task);
  if (assigneeIds !== undefined) {
    // Anyone unassigned needs their own UI to refresh (the task drops out of
    // their list) even though broadcastTaskChange above no longer reaches
    // them — it only emits to the task's current creator/assignees/admins.
    const nowAssigned = new Set(task.assignees.map((a) => a.id));
    for (const removedId of beforeAssigneeIds) {
      if (!nowAssigned.has(removedId)) emitToUser(removedId, "task_updated", { taskId: id });
    }
  }

  return NextResponse.json({ task });
}

/** Soft delete — moves the task to Trash rather than removing it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canDeleteTask(user, access))) {
    return NextResponse.json({ error: "Only the creator or an admin can delete this task" }, { status: 403 });
  }

  await db.task.update({ where: { id }, data: { deletedAt: new Date(), deletedById: user.id } });
  broadcastTaskChange("task_deleted", access);

  return NextResponse.json({ ok: true });
}
