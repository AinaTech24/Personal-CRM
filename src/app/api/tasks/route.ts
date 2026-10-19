import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastTaskChange, canDeleteTask, taskListWhere } from "@/lib/tasks";
import { notifyAndPush } from "@/lib/notify";
import { resolveTeamScope } from "@/lib/team-scope";
import { moduleAccessScope } from "@/lib/module-permissions-store";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The Social Media / CRM Team console's Tasks tab explicitly asks for the
  // team-only view (scope=social-media|crm) — narrower than an Admin's
  // normal company-wide list.
  const { teamOnly, teamUserIds } = await resolveTeamScope(user, req.nextUrl.searchParams.get("scope"));
  if (teamOnly && !teamUserIds) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = await moduleAccessScope(user, "TASKS", "READ");

  const tasks = await db.task.findMany({
    where: taskListWhere(user, teamUserIds, teamOnly, scope),
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
    await notifyAndPush(
      data.assignedToId,
      "task_assigned",
      { taskId: task.id, taskTitle: task.title, actorName: user.name },
      { title: "Task assigned", body: `${user.name} assigned you the task "${task.title}"`, url: "/tasks", tag: "task-assigned" }
    );
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

  const tasks = await db.task.findMany({
    where: { id: { in: parsed.data.ids } },
    include: { createdBy: { select: { departmentId: true } }, assignedTo: { select: { departmentId: true } } },
  });
  const deletableFlags = await Promise.all(tasks.map((t) => canDeleteTask(user, t)));
  const deletable = tasks.filter((_t, i) => deletableFlags[i]);

  if (deletable.length > 0) {
    await db.task.deleteMany({ where: { id: { in: deletable.map((t) => t.id) } } });
    for (const task of deletable) broadcastTaskChange("task_deleted", task);
  }

  const skipped = parsed.data.ids.length - deletable.length;
  return NextResponse.json({ deleted: deletable.length, skipped });
}
