import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { getSocialMembership } from "@/lib/social-media";
import { isSocialMediaLead } from "@/lib/social-media-permissions";
import { getCrmMembership, isCrmLead } from "@/lib/crm-team";
import { canManageModule } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";

/**
 * Company Admins/Super Admins, "department admins" (a Social Media or CRM
 * team lead), or a Permission Manager FORMS grant — any of the three can
 * build/edit/delete any form and see every form that exists. `action`
 * defaults to READ for an open-the-page/list check; callers that mutate
 * (create, edit, delete) pass the matching action so a grant missing just
 * that one action is correctly refused, same as every other module's
 * per-action grant.
 */
export async function canManageForms(user: PermissionUser, action: ModuleAction = "READ"): Promise<boolean> {
  if (isAdmin(user)) return true;
  const [socialMembership, crmMembership] = await Promise.all([getSocialMembership(user.id), getCrmMembership(user.id)]);
  if (isSocialMediaLead(user, socialMembership) || isCrmLead(user, crmMembership)) return true;
  return canManageModule(user, "FORMS", action);
}

/** Viewing one specific form's submissions — admins and department admins (see canManageForms), plus whichever departments that form was shared with. */
export async function canViewFormSubmissions(user: PermissionUser, viewerDepartmentIds: string[]): Promise<boolean> {
  if (await canManageForms(user)) return true;
  return !!user.departmentId && viewerDepartmentIds.includes(user.departmentId);
}

/** Whether this non-admin user's department was shared on at least one form — gates the /forms page and its sidebar link for them. Admins and department admins always pass without needing this. */
export async function hasAnyFormAccess(user: PermissionUser): Promise<boolean> {
  if (await canManageForms(user)) return true;
  if (!user.departmentId) return false;
  const match = await db.formViewerDepartment.findFirst({ where: { departmentId: user.departmentId }, select: { id: true } });
  return !!match;
}

/** Hex characters long enough that a brute-force guess is infeasible, short enough to stay a reasonable URL. */
export const FORM_SLUG_PATTERN = /^[0-9a-f]{12}$/;

/**
 * A fresh, unique public URL segment (/f/<slug>) — a random hash, not derived
 * from the title, so a form's link can't be guessed from its name (an
 * "Appointment Form" shouldn't be reachable by anyone who thinks to try
 * /f/appointment-form). `Form.slug` is also `@unique` in the schema, so the
 * collision check here is about not wasting a round trip on an unlucky
 * collision, not the only thing enforcing uniqueness.
 */
export async function uniqueFormSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomBytes(6).toString("hex");
    const existing = await db.form.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Couldn't generate a unique form link — try again");
}

/** True if a Prisma error is a unique-constraint violation (P2002) — used to retry a slug collision at create time. */
export function isUniqueConstraintError(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "P2002";
}
