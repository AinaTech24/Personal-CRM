import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { noteListWhere, canManageNote, broadcastNoteChange } from "@/lib/notes";
import { NOTE_COLORS } from "@/lib/note-colors";

const noteInclude = {
  author: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
  department: { select: { id: true, name: true } },
};

const COLOR_KEYS = NOTE_COLORS.map((c) => c.key);

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

  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const filter = params.get("filter"); // "pinned" | "mine" | null
  const color = params.get("color");
  const departmentIdParam = params.get("departmentId");
  const authorIdParam = params.get("authorId");

  const and: object[] = [noteListWhere(user)];

  if (filter === "pinned") and.push({ isPinned: true });
  if (filter === "mine") and.push({ authorId: user.id });
  if (color && COLOR_KEYS.includes(color as (typeof COLOR_KEYS)[number])) and.push({ color });

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

  const notes = await db.note.findMany({
    where: { AND: and },
    include: noteInclude,
    orderBy,
  });

  const withPermissions = notes.map((n) => ({ ...n, canManage: canManageNote(user, n) }));
  return NextResponse.json({ notes: withPermissions });
}

const bodySchema = z.object({
  title: z.string().trim().max(200).default(""),
  content: z.string().trim().max(20000).default(""),
  color: z.enum(["WHITE", "PINK", "BLUE", "GREEN", "YELLOW", "LAVENDER", "PEACH", "GRAY"]).default("WHITE"),
  isPinned: z.boolean().default(false),
});

/** Creates a note for the authenticated user. Author and department are always taken from the session — never from the request body. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      color: d.color,
      isPinned: d.isPinned,
      authorId: user.id,
      departmentId: user.departmentId,
    },
    include: noteInclude,
  });

  broadcastNoteChange("note_created", note);
  return NextResponse.json({ note: { ...note, canManage: true } }, { status: 201 });
}
