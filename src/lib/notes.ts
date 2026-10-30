import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { isModuleBlocked, moduleAccessScope } from "@/lib/module-permissions-store";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

type NotesScope = "all" | { departmentId: string } | null;

/**
 * Notes has a fixed 3-tier floor, same shape as other own-record modules:
 *   - Admin/Super Admin: every note, every department.
 *   - Department Admin: their own notes, plus every note whose snapshotted
 *     departmentId matches their own department (that includes other
 *     Department Admins and ordinary users in the same department).
 *   - Everyone else: only notes they authored.
 * A Permission Manager NOTES grant (`scope`, from moduleAccessScope) widens
 * beyond that floor the same way a Tasks/Leads/Meetings grant does — "all"
 * for a company-wide grant, or every note in the grant holder's department
 * for a department-scoped one — it never narrows it.
 */
export function noteListWhere(user: PermissionUser, scope?: NotesScope, opts?: { trashed?: boolean }) {
  const deletedAtWhere = opts?.trashed ? { not: null } : null;
  if (isAdmin(user) || scope === "all") return { deletedAt: deletedAtWhere };
  const or: object[] = [{ authorId: user.id }];
  if (isDepartmentAdmin(user) && user.departmentId) or.push({ departmentId: user.departmentId });
  if (scope && typeof scope === "object") or.push({ departmentId: scope.departmentId });
  return { AND: [{ deletedAt: deletedAtWhere }, { OR: or }] };
}

export function canManageNote(user: PermissionUser, note: { authorId: string; departmentId: string | null }, scope?: NotesScope) {
  if (isAdmin(user)) return true;
  if (note.authorId === user.id) return true;
  if (isDepartmentAdmin(user) && !!user.departmentId && note.departmentId === user.departmentId) return true;
  if (scope === "all") return true;
  return !!scope && typeof scope === "object" && note.departmentId === scope.departmentId;
}

/** Live-updates anyone who can currently see this note: the author, their department (for a Department Admin's view), and all Admins. */
export function broadcastNoteChange(
  event: "note_created" | "note_updated" | "note_deleted",
  note: { id: string; authorId: string; departmentId: string | null }
) {
  emitToUser(note.authorId, event, { noteId: note.id });
  if (note.departmentId) emitToDepartment(note.departmentId, event, { noteId: note.id });
  emitToAdmins(event, { noteId: note.id });
}

/** True if a Prisma error is a "record not found" (P2025) — the delete/update already-gone race. */
export function isRecordNotFoundError(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "P2025";
}

/* ------------------------------- Trash ------------------------------- */

/** Every trashed note this user can see — same visibility rule as the live list, just the opposite set of `deletedAt`. */
export async function listTrashedNotesFor(user: PermissionUser): Promise<TrashItem[]> {
  if (await isModuleBlocked(user, "NOTES")) return [];
  const scope = await moduleAccessScope(user, "NOTES", "READ");
  const notes = await db.note.findMany({
    where: noteListWhere(user, scope, { trashed: true }),
    include: { deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return notes.map((n) => ({
    id: n.id,
    module: "notes",
    moduleLabel: "Notes",
    title: n.title,
    subtitle: null,
    deletedAt: n.deletedAt!.toISOString(),
    deletedBy: n.deletedBy,
    expiresAt: trashExpiresAt(n.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the note back exactly as it was. */
export async function restoreNote(user: PermissionUser, noteId: string): Promise<TrashActionResult> {
  const note = await db.note.findUnique({ where: { id: noteId }, select: { authorId: true, departmentId: true, deletedAt: true } });
  if (!note || !note.deletedAt) return "not_found";
  const scope = await moduleAccessScope(user, "NOTES", "DELETE");
  if (!canManageNote(user, note, scope)) return "forbidden";

  const restored = await db.note.update({ where: { id: noteId }, data: { deletedAt: null, deletedById: null } });
  broadcastNoteChange("note_created", restored);
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeNote(user: PermissionUser, noteId: string): Promise<TrashActionResult> {
  const note = await db.note.findUnique({ where: { id: noteId }, select: { authorId: true, departmentId: true, deletedAt: true } });
  if (!note || !note.deletedAt) return "not_found";
  const scope = await moduleAccessScope(user, "NOTES", "DELETE");
  if (!canManageNote(user, note, scope)) return "forbidden";

  await db.note.delete({ where: { id: noteId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredNotes(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.note.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
