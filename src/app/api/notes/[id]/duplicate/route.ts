import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageNote, broadcastNoteChange } from "@/lib/notes";
import { isModuleBlocked, moduleAccessScope } from "@/lib/module-permissions-store";

const noteInclude = {
  author: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
  department: { select: { id: true, name: true } },
};

/** Duplicates a note as a new one owned by the actor — content and color carry over, pin state and author/department reset to theirs, like any other new note. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "NOTES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.note.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await moduleAccessScope(user, "NOTES", "UPDATE");
  if (!canManageNote(user, existing, scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const note = await db.note.create({
    data: {
      title: `${existing.title} (Copy)`,
      content: existing.content,
      color: existing.color,
      isPinned: false,
      authorId: user.id,
      departmentId: user.departmentId,
    },
    include: noteInclude,
  });

  broadcastNoteChange("note_created", note);
  return NextResponse.json({ note: { ...note, canManage: true } }, { status: 201 });
}
