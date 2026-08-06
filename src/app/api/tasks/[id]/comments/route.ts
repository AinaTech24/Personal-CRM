import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTaskForUser } from "@/lib/tasks";
import { notifyAndPush } from "@/lib/notify";

const bodySchema = z.object({ body: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const comment = await db.taskComment.create({
    data: { taskId: id, authorId: user.id, body: parsed.data.body },
    include: { author: { select: { name: true } } },
  });

  const notifyTargets = new Set(
    [access.createdById, access.assignedToId].filter((uid): uid is string => !!uid && uid !== user.id)
  );
  for (const targetId of notifyTargets) {
    await notifyAndPush(
      targetId,
      "task_comment",
      { taskId: id, taskTitle: access.title, actorName: user.name },
      { title: "New comment", body: `${user.name} commented on the task "${access.title}"`, url: "/tasks", tag: `task-comment-${id}` }
    );
  }

  return NextResponse.json({ comment }, { status: 201 });
}
