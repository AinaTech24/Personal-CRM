import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastTaskChange, canDeleteTask, taskListWhere } from "@/lib/tasks";
import { notifyUser } from "@/lib/notify";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await db.task.findMany({
    where: taskListWhere(user),
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ tasks });
}

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"]).default("TODO"),
  dueDate: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  remindAt: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;

  const task = await db.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      status: data.status,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assignedToId: data.assignedToId || null,
      createdById: user.id,
      remindAt: data.remindAt ? new Date(data.remindAt) : null,
    },
  });

  if (data.assignedToId && data.assignedToId !== user.id) {
    await notifyUser(data.assignedToId, "task_assigned", { taskId: task.id, taskTitle: task.title, actorName: user.name });
  }

  broadcastTaskChange("task_created", task);

  return NextResponse.json({ task }, { status: 201 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const tasks = await db.task.findMany({ where: { id: { in: parsed.data.ids } } });
  const deletable = tasks.filter((t) => canDeleteTask(user, t));

  if (deletable.length > 0) {
    await db.task.deleteMany({ where: { id: { in: deletable.map((t) => t.id) } } });
    for (const task of deletable) broadcastTaskChange("task_deleted", task);
  }

  const skipped = parsed.data.ids.length - deletable.length;
  return NextResponse.json({ deleted: deletable.length, skipped });
}
