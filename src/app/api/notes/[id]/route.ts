import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageNote, broadcastNoteChange, isRecordNotFoundError } from "@/lib/notes";
import { isModuleBlocked, moduleAccessScope } from "@/lib/module-permissions-store";
import { isValidHexColor } from "@/lib/note-colors";
import { MAX_TAGS, MAX_TAG_LENGTH, parseTags, serializeTags } from "@/lib/note-tags";

const noteInclude = {
  author: { select: { id: true, name: true, surname: true } },
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
  // No "|" — that's serializeTags' own delimiter, and a tag containing one would silently split into two.
  tags: z
    .array(z.string().trim().min(1).max(MAX_TAG_LENGTH).regex(/^[^|]+$/, 'Tags can\'t contain "|"'))
    .max(MAX_TAGS)
    .optional(),
});

/**
 * Edits a note's title/content/color/pinned state — never its author or
 * department, which aren't in this schema at all, so there's nothing a
 * client could send to reassign ownership even by accident.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isModuleBlocked(user, "NOTES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.note.findUnique({ where: { id }, select: { authorId: true, departmentId: true, updatedAt: true, deletedAt: true } });
  // A trashed note is only reachable through the Trash routes (restore/purge).
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await moduleAccessScope(user, "NOTES", "UPDATE");
  if (!canManageNote(user, existing, scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  const isPinOnlyToggle =
    d.isPinned !== undefined && d.title === undefined && d.content === undefined && d.color === undefined && d.tags === undefined;

  const note = await db.note.update({
    where: { id },
    data: {
      ...(d.title !== undefined && { title: d.title || "Untitled note" }),
      ...(d.content !== undefined && { content: d.content }),
      ...(d.color !== undefined && { color: d.color }),
      ...(d.isPinned !== undefined && { isPinned: d.isPinned }),
      ...(d.tags !== undefined && { tags: serializeTags(d.tags) }),
      ...(isPinOnlyToggle && { updatedAt: existing.updatedAt }),
    },
    include: noteInclude,
  });

  broadcastNoteChange("note_updated", note);
  return NextResponse.json({ note: { ...note, tags: parseTags(note.tags), canManage: true } });
}

/** Soft delete — moves the note to Trash rather than removing it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isModuleBlocked(user, "NOTES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.note.findUnique({ where: { id }, select: { authorId: true, departmentId: true, deletedAt: true } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await moduleAccessScope(user, "NOTES", "DELETE");
  if (!canManageNote(user, existing, scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await db.note.update({ where: { id }, data: { deletedAt: new Date(), deletedById: user.id } });
  } catch (err) {
    // Already gone (e.g. a second delete click racing the first) — same end
    // state as a successful delete, not a real failure.
    if (!isRecordNotFoundError(err)) throw err;
  }

  broadcastNoteChange("note_deleted", { id, ...existing });
  return NextResponse.json({ ok: true });
}
