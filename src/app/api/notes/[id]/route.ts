import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageNote, broadcastNoteChange, isRecordNotFoundError } from "@/lib/notes";
import { isValidHexColor } from "@/lib/note-colors";

const noteInclude = {
  author: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
  department: { select: { id: true, name: true } },
};

const patchSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().max(20000).optional(),
  // A hex string ("#fecdd3"), or null to clear back to the default theme card background.
  color: z
    .string()
    .trim()
    .refine(isValidHexColor, "Must be a #rrggbb color")
    .nullable()
    .optional(),
  isPinned: z.boolean().optional(),
});

/**
 * Edits a note's title/content/color/pinned state — never its author or
 * department, which aren't in this schema at all, so there's nothing a
 * client could send to reassign ownership even by accident.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.note.findUnique({ where: { id }, select: { authorId: true, departmentId: true, updatedAt: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageNote(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;
  if (d.title !== undefined && !d.title && d.content !== undefined && !d.content) {
    return NextResponse.json({ error: "Give the note a title or some content" }, { status: 400 });
  }

  // Pinning/unpinning alone shouldn't disturb anything else about the note —
  // not its "last updated" sort position, not its "updated Xm ago" label —
  // so a pin-only PATCH keeps the existing updatedAt instead of letting
  // Prisma's @updatedAt bump it.
  const isPinOnlyToggle = d.isPinned !== undefined && d.title === undefined && d.content === undefined && d.color === undefined;

  const note = await db.note.update({
    where: { id },
    data: {
      ...(d.title !== undefined && { title: d.title || "Untitled note" }),
      ...(d.content !== undefined && { content: d.content }),
      ...(d.color !== undefined && { color: d.color }),
      ...(d.isPinned !== undefined && { isPinned: d.isPinned }),
      ...(isPinOnlyToggle && { updatedAt: existing.updatedAt }),
    },
    include: noteInclude,
  });

  broadcastNoteChange("note_updated", note);
  return NextResponse.json({ note: { ...note, canManage: true } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.note.findUnique({ where: { id }, select: { authorId: true, departmentId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageNote(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await db.note.delete({ where: { id } });
  } catch (err) {
    // Already gone (e.g. a second delete click racing the first) — same end
    // state as a successful delete, not a real failure.
    if (!isRecordNotFoundError(err)) throw err;
  }

  broadcastNoteChange("note_deleted", { id, ...existing });
  return NextResponse.json({ ok: true });
}
