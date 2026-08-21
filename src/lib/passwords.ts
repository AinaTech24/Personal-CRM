import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";

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

export function passwordEntryListWhere(user: PermissionUser): Prisma.PasswordEntryWhereInput {
  if (isAdmin(user)) return {};
  return {
    OR: [{ departmentId: user.departmentId ?? "__none__" }, { shares: { some: { userId: user.id } } }],
  };
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
  if (!entry) return null;
  if (!canAccessPasswordEntry(user, entry)) return "forbidden" as const;
  return entry;
}

/** Never records the password itself — only the action and non-secret metadata. */
export async function logPasswordActivity(passwordEntryId: string, actorId: string, action: string, meta?: object) {
  await db.passwordEntryActivity.create({ data: { passwordEntryId, actorId, action, meta } });
}
