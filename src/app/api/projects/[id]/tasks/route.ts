import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";
import { broadcastTaskChange } from "@/lib/tasks";
import { notifyAndPush } from "@/lib/notify";

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  milestoneId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  assignedById: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  dependsOnIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id, "UPDATE");
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
      // Falls back to the submitter: in the ordinary case the person raising
      // the task is the person assigning it, and making them re-pick themselves
      // would just be a field everyone leaves alone.
      assignedById: data.assignedById || user.id,
      createdById: user.id,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      dependsOn: data.dependsOnIds.length
        ? { create: data.dependsOnIds.map((dependsOnId) => ({ dependsOnId })) }
        : undefined,
    },
    include: { assignedBy: { select: { id: true, name: true } } },
  });

  // Mirror the project task into the global Tasks module so it shows up there
  // too. The link (projectTaskParentId) lets the two stay in step on edit and
  // delete. Project tasks carry no priority of their own, so the module copy
  // starts at the default.
  const mirrored = await db.task.create({
    data: {
      title: task.title,
      description: task.description,
      status: task.status,
      dueDate: task.dueDate,
      assignedToId: task.assignedToId,
      createdById: user.id,
      projectTaskParentId: task.id,
    },
  });

  await logProjectActivity(id, user.id, "task_added", {
    title: task.title,
    // Recorded only when it differs, so the activity line stays quiet in the
    // normal case and calls out the on-behalf-of case.
    ...(task.assignedById && task.assignedById !== user.id && { assignedByName: task.assignedBy?.name }),
  });
  if (data.assignedToId && data.assignedToId !== user.id) {
    // Notify once, about the project task — the mirrored module task is the same
    // work, so a second "task assigned" would just be noise.
    await notifyAndPush(
      data.assignedToId,
      "project_task_assigned",
      { projectId: id, taskTitle: task.title, actorName: user.name },
      { title: "Project task assigned", body: `${user.name} assigned you the project task "${task.title}"`, url: `/projects/${id}`, tag: "project-task-assigned" }
    );
  }
  broadcastTaskChange("task_created", mirrored);

  return NextResponse.json({ task }, { status: 201 });
}
