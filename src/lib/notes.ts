import type { PermissionUser } from "@/lib/permissions";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";

/**
 * Notes has its own fixed 3-tier visibility, independent of the Permission
 * Manager's per-module grants every other module uses:
 *   - Admin/Super Admin: every note, every department.
 *   - Department Admin: their own notes, plus every note whose snapshotted
 *     departmentId matches their own department (that includes other
 *     Department Admins and ordinary users in the same department).
 *   - Everyone else: only notes they authored.
 * A plain Permission Manager grant (without being isDepartmentAdmin) never
 * widens Notes access — this module was deliberately left out of
 * ManagedModule.
 */
export function noteListWhere(user: PermissionUser) {
  if (isAdmin(user)) return {};
  if (isDepartmentAdmin(user) && user.departmentId) {
    return { OR: [{ authorId: user.id }, { departmentId: user.departmentId }] };
  }
  return { authorId: user.id };
}

export function canManageNote(user: PermissionUser, note: { authorId: string; departmentId: string | null }) {
  if (isAdmin(user)) return true;
  if (note.authorId === user.id) return true;
  return isDepartmentAdmin(user) && !!user.departmentId && note.departmentId === user.departmentId;
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
