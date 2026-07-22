import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";
import { notifyUser } from "@/lib/notify";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"]).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  milestoneId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  assignedById: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dependsOnIds: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, taskId } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const before = await db.projectTask.findUnique({ where: { id: taskId, projectId: id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;

  if (data.dependsOnIds !== undefined) {
    await db.projectTaskDependency.deleteMany({ where: { taskId } });
    if (data.dependsOnIds.length) {
      await db.projectTaskDependency.createMany({
        data: data.dependsOnIds.map((dependsOnId) => ({ taskId, dependsOnId })),
      });
    }
  }

  const task = await db.projectTask.update({
    where: { id: taskId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.progressPct !== undefined && { progressPct: data.progressPct }),
      ...(data.milestoneId !== undefined && { milestoneId: data.milestoneId }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
      // createdById is deliberately absent: who raised the task is a fact, not
      // a field.
      ...(data.assignedById !== undefined && { assignedById: data.assignedById }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
    },
  });

  if (data.status && data.status !== before.status) {
    await logProjectActivity(id, user.id, "task_status_changed", {
      title: task.title,
      from: before.status,
      to: data.status,
    });
  }

  if (data.assignedToId !== undefined && data.assignedToId !== before.assignedToId) {
    if (data.assignedToId && data.assignedToId !== user.id) {
      await notifyUser(data.assignedToId, "project_task_assigned", { projectId: id, taskTitle: task.title, actorName: user.name });
    }
  }

  return NextResponse.json({ task });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, taskId } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.projectTask.delete({ where: { id: taskId, projectId: id } });
  await logProjectActivity(id, user.id, "task_removed");

  return NextResponse.json({ ok: true });
}
