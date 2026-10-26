import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { noteListWhere } from "@/lib/notes";
import { parseTags } from "@/lib/note-tags";
import { isModuleBlocked, moduleAccessScope } from "@/lib/module-permissions-store";

/** Every distinct tag across the notes this user can currently see — for the filter dropdown and the editor's tag suggestions, not a company-wide tag registry. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "NOTES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = await moduleAccessScope(user, "NOTES", "READ");
  const rows = await db.note.findMany({ where: noteListWhere(user, scope), select: { tags: true } });

  const all = new Set<string>();
  for (const row of rows) for (const tag of parseTags(row.tags)) all.add(tag);

  return NextResponse.json({ tags: Array.from(all).sort((a, b) => a.localeCompare(b)) });
}
