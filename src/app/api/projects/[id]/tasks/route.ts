import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";
import { notifyUser } from "@/lib/notify";

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  milestoneId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  dependsOnIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;

  const task = await db.projectTask.create({
    data: {
      projectId: id,
      title: data.title,
      description: data.description || null,
      milestoneId: data.milestoneId || null,
      parentTaskId: data.parentTaskId || null,
      assignedToId: data.assignedToId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      dependsOn: data.dependsOnIds.length
        ? { create: data.dependsOnIds.map((dependsOnId) => ({ dependsOnId })) }
        : undefined,
    },
  });

  await logProjectActivity(id, user.id, "task_added", { title: task.title });
  if (data.assignedToId && data.assignedToId !== user.id) {
    await notifyUser(data.assignedToId, "project_task_assigned", { projectId: id, taskTitle: task.title, actorName: user.name });
  }

  return NextResponse.json({ task }, { status: 201 });
}
