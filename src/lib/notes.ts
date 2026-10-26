import type { PermissionUser } from "@/lib/permissions";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";

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
export function noteListWhere(user: PermissionUser, scope?: NotesScope) {
  if (isAdmin(user) || scope === "all") return {};
  const or: object[] = [{ authorId: user.id }];
  if (isDepartmentAdmin(user) && user.departmentId) or.push({ departmentId: user.departmentId });
  if (scope && typeof scope === "object") or.push({ departmentId: scope.departmentId });
  return { OR: or };
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
