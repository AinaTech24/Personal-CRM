import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

/**
 * Password Manager access rules:
 *  - Admin/Super Admin: every entry, company-wide.
 *  - Everyone else: entries in their own department, plus any entry
 *    explicitly shared with them (PasswordEntryShare), regardless of which
 *    department it belongs to.
 *  - "Manage" (edit/delete/share) is narrower than "view": only an admin or
 *    someone in the entry's own department — a user an entry was shared
 *    *with* can view/reveal/copy it, but not edit, delete, reshare it, or
 *    see the department's other entries. They can remove their own access.
 */

type EntryWithShares = { departmentId: string; shares: { userId: string }[] };

export function passwordEntryListWhere(user: PermissionUser, opts?: { trashed?: boolean }): Prisma.PasswordEntryWhereInput {
  const scope = isAdmin(user)
    ? {}
    : { OR: [{ departmentId: user.departmentId ?? "__none__" }, { shares: { some: { userId: user.id } } }] };
  return { AND: [scope, { deletedAt: opts?.trashed ? { not: null } : null }] };
}

export function canAccessPasswordEntry(user: PermissionUser, entry: EntryWithShares): boolean {
  if (isAdmin(user)) return true;
  if (entry.departmentId === user.departmentId) return true;
  return entry.shares.some((s) => s.userId === user.id);
}

export function canManagePasswordEntry(user: PermissionUser, entry: { departmentId: string }): boolean {
  if (isAdmin(user)) return true;
  return entry.departmentId === user.departmentId;
}

/** Looks up an entry (with its shares, for the access check) and returns it, "forbidden", or null (not found) — same three-way shape as getProjectForUser/getSocialClientForUser. */
export async function getPasswordEntryForUser(user: PermissionUser, id: string) {
  const entry = await db.passwordEntry.findUnique({ where: { id }, include: { shares: { select: { userId: true } } } });
  if (!entry || entry.deletedAt) return null;
  if (!canAccessPasswordEntry(user, entry)) return "forbidden" as const;
  return entry;
}

/** Never records the password itself — only the action and non-secret metadata. */
export async function logPasswordActivity(passwordEntryId: string, actorId: string, action: string, meta?: object) {
  await db.passwordEntryActivity.create({ data: { passwordEntryId, actorId, action, meta } });
}

/* ------------------------------- Trash ------------------------------- */

/** Every trashed entry this user can see — same visibility rule as the live list. */
export async function listTrashedPasswordEntriesFor(user: PermissionUser): Promise<TrashItem[]> {
  const entries = await db.passwordEntry.findMany({
    where: passwordEntryListWhere(user, { trashed: true }),
    include: { deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return entries.map((e) => ({
    id: e.id,
    module: "passwords",
    moduleLabel: "Passwords",
    title: e.label,
    subtitle: e.username,
    deletedAt: e.deletedAt!.toISOString(),
    deletedBy: e.deletedBy,
    expiresAt: trashExpiresAt(e.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the entry back exactly as it was. */
export async function restorePasswordEntry(user: PermissionUser, entryId: string): Promise<TrashActionResult> {
  const entry = await db.passwordEntry.findUnique({ where: { id: entryId } });
  if (!entry || !entry.deletedAt) return "not_found";
  if (!canManagePasswordEntry(user, entry)) return "forbidden";

  await db.passwordEntry.update({ where: { id: entryId }, data: { deletedAt: null, deletedById: null } });
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgePasswordEntry(user: PermissionUser, entryId: string): Promise<TrashActionResult> {
  const entry = await db.passwordEntry.findUnique({ where: { id: entryId } });
  if (!entry || !entry.deletedAt) return "not_found";
  if (!canManagePasswordEntry(user, entry)) return "forbidden";

  await db.passwordEntry.delete({ where: { id: entryId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredPasswordEntries(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.passwordEntry.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
