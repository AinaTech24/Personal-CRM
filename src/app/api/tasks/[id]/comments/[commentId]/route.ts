import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getTaskForUser } from "@/lib/tasks";

/**
 * Deleting a comment is narrower than deleting the task itself: the comment's
 * own author, or an admin for moderation — not the task's creator/assignee
 * just by virtue of owning the task, which would let them silence someone
 * else's remark on their own task.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, commentId } = await params;
  const access = await getTaskForUser(user, id, "UPDATE");
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comment = await db.taskComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.taskId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (comment.authorId !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
  }

  await db.taskComment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}
