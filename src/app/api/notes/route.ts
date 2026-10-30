import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { noteListWhere, canManageNote, broadcastNoteChange } from "@/lib/notes";
import { isValidHexColor } from "@/lib/note-colors";
import { MAX_TAGS, MAX_TAG_LENGTH, parseTags, serializeTags, tagContainsFragment } from "@/lib/note-tags";
import { isModuleBlocked, moduleAccessScope } from "@/lib/module-permissions-store";
import { parsePageParams } from "@/lib/pagination";

const noteInclude = {
  // No avatarDataUrl — the Notes UI never renders an author avatar image,
  // so including that base64 blob on every row was pure dead weight.
  author: { select: { id: true, name: true, surname: true } },
  department: { select: { id: true, name: true } },
};

/**
 * Every note this user may see (noteListWhere), optionally narrowed by a
 * free-text search, a color, a quick filter ("pinned"/"mine"), and — for an
 * Admin or a Department Admin only — a department/author filter. A filter
 * param outside what the actor is actually allowed to see is ignored rather
 * than erroring, since the base noteListWhere scope still applies underneath
 * either way (so it can never widen access, only fail to narrow it).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "NOTES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const filter = params.get("filter"); // "pinned" | "mine" | null
  const color = params.get("color");
  const tag = params.get("tag")?.trim();
  const departmentIdParam = params.get("departmentId");
  const authorIdParam = params.get("authorId");

  const scope = await moduleAccessScope(user, "NOTES", "READ");
  const and: object[] = [noteListWhere(user, scope)];

  if (filter === "pinned") and.push({ isPinned: true });
  if (filter === "mine") and.push({ authorId: user.id });
  if (color && isValidHexColor(color)) and.push({ color });
  if (tag) and.push({ tags: { contains: tagContainsFragment(tag) } });

  if (departmentIdParam && (isAdmin(user) || (isDepartmentAdmin(user) && user.departmentId === departmentIdParam))) {
    and.push({ departmentId: departmentIdParam });
  }
  if (authorIdParam && (isAdmin(user) || isDepartmentAdmin(user))) {
    and.push({ authorId: authorIdParam });
  }
  if (q) {
    and.push({ OR: [{ title: { contains: q } }, { content: { contains: q } }] });
  }

  const sort = params.get("sort");
  const orderBy =
    sort === "created"
      ? [{ createdAt: "desc" as const }]
      : sort === "title"
        ? [{ title: "asc" as const }]
        : sort === "pinned"
          ? [{ isPinned: "desc" as const }, { updatedAt: "desc" as const }]
          : [{ updatedAt: "desc" as const }];

  const where = { AND: and };
  const { take, skip } = parsePageParams(params, { defaultTake: 50, maxTake: 200 });

  const [notes, total] = await Promise.all([
    db.note.findMany({ where, include: noteInclude, orderBy, take, skip }),
    db.note.count({ where }),
  ]);

  const withPermissions = notes.map((n) => ({ ...n, tags: parseTags(n.tags), canManage: canManageNote(user, n, scope) }));
  return NextResponse.json({ notes: withPermissions, total, hasMore: skip + notes.length < total });
}

// No "|" — that's serializeTags' own delimiter, and a tag containing one would silently split into two.
const tagsSchema = z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH).regex(/^[^|]+$/, 'Tags can\'t contain "|"')).max(MAX_TAGS);

const bodySchema = z.object({
  title: z.string().trim().max(200).default(""),
  content: z.string().trim().max(20000).default(""),
  // A hex string ("#fecdd3"), or null/omitted for the default theme card background.
  color: z
    .string()
    .trim()
    .refine(isValidHexColor, "Must be a #rrggbb color")
    .nullable()
    .optional(),
  isPinned: z.boolean().default(false),
  tags: tagsSchema.default([]),
});

/** Creates a note for the authenticated user. Author and department are always taken from the session — never from the request body. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "NOTES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;
  if (!d.title && !d.content) {
    return NextResponse.json({ error: "Give the note a title or some content" }, { status: 400 });
  }

  const note = await db.note.create({
    data: {
      title: d.title || "Untitled note",
      content: d.content,
      color: d.color ?? null,
      isPinned: d.isPinned,
      tags: serializeTags(d.tags),
      authorId: user.id,
      departmentId: user.departmentId,
    },
    include: noteInclude,
  });

  broadcastNoteChange("note_created", note);
  return NextResponse.json({ note: { ...note, tags: parseTags(note.tags), canManage: true } }, { status: 201 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

/** Moves every note in `ids` the caller is actually allowed to delete to Trash, silently skipping the rest rather than failing the whole batch. */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "NOTES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const scope = await moduleAccessScope(user, "NOTES", "DELETE");
  const notes = await db.note.findMany({ where: { id: { in: parsed.data.ids }, deletedAt: null } });
  const deletable = notes.filter((n) => canManageNote(user, n, scope));

  if (deletable.length > 0) {
    await db.note.updateMany({
      where: { id: { in: deletable.map((n) => n.id) } },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
    for (const note of deletable) broadcastNoteChange("note_deleted", note);
  }

  const skipped = parsed.data.ids.length - deletable.length;
  return NextResponse.json({ deleted: deletable.length, skipped });
}
