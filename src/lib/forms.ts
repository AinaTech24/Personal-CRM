import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

/** Building/editing/deleting forms, and seeing every form that exists. */
export function canManageForms(user: PermissionUser): boolean {
  return isAdmin(user);
}

/** Viewing one specific form's submissions — admins, plus whichever departments that form was shared with. */
export function canViewFormSubmissions(user: PermissionUser, viewerDepartmentIds: string[]): boolean {
  if (isAdmin(user)) return true;
  return !!user.departmentId && viewerDepartmentIds.includes(user.departmentId);
}

/** Whether this non-admin user's department was shared on at least one form — gates the /forms page and its sidebar link for them. Admins always pass without needing this. */
export async function hasAnyFormAccess(user: PermissionUser): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (!user.departmentId) return false;
  const match = await db.formViewerDepartment.findFirst({ where: { departmentId: user.departmentId }, select: { id: true } });
  return !!match;
}

/**
 * A fresh, unique slug for a new form's public URL (/f/<slug>) — collisions
 * (including two people creating same-titled forms at the same moment) get a
 * short random suffix. `Form.slug` is also `@unique` in the schema, so this
 * is a courtesy check for a clean URL, not the only thing enforcing it.
 */
export async function uniqueFormSlug(title: string): Promise<string> {
  const base = slugify(title) || "form";
  const existing = await db.form.findUnique({ where: { slug: base }, select: { id: true } });
  if (!existing) return base;
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** True if a Prisma error is a unique-constraint violation (P2002) — used to retry a slug collision at create time. */
export function isUniqueConstraintError(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "P2002";
}
