import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getTaskForUser } from "@/lib/tasks";

/**
 * Deleting an attachment is scoped like deleting a comment: whoever added it,
 * or an admin — not everyone who can manage the task, since a file (or link)
 * is one person's contribution, not shared task metadata like its due date.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, attachmentId } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = await db.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.taskId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (attachment.uploadedById !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: "You can only delete attachments you added" }, { status: 403 });
  }

  // Files live as a base64 blob in this row, not on disk — deleting the row is
  // the entire cleanup, no separate filesystem step.
  await db.taskAttachment.delete({ where: { id: attachmentId } });
  return NextResponse.json({ ok: true });
}
