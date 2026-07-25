import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastTaskChange, canDeleteTask, getTaskForUser } from "@/lib/tasks";
import { notifyUser } from "@/lib/notify";

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
      createdBy: { select: { id: true, name: true } },
      comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      attachments: {
        include: { uploadedBy: { select: { name: true } } },
        omit: { data: true }, // never ship the base64 blob in the list payload
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({ task });
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"]).optional(),
  dueDate: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;
  const before = access;

  const task = await db.task.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
    },
  });

  if (
    data.assignedToId !== undefined &&
    data.assignedToId !== before.assignedToId &&
    data.assignedToId &&
    data.assignedToId !== user.id
  ) {
    await notifyUser(data.assignedToId, "task_assigned", { taskId: id, taskTitle: task.title, actorName: user.name });
  }

  broadcastTaskChange("task_updated", task);
  if (before.assignedToId && before.assignedToId !== task.assignedToId) {
    broadcastTaskChange("task_updated", { ...task, assignedToId: before.assignedToId });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDeleteTask(user, access)) {
    return NextResponse.json({ error: "Only the creator or an admin can delete this task" }, { status: 403 });
  }

  await db.task.delete({ where: { id } });
  broadcastTaskChange("task_deleted", access);

  return NextResponse.json({ ok: true });
}
