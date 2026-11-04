import { db } from "@/lib/db";
import { notifyAndPush } from "@/lib/notify";
import type { PermissionUser } from "@/lib/permissions";

/**
 * Everyone who manages this form's submissions: its creator, plus every
 * active user in a department it was shared with. Shared by the submit
 * route (a fresh response just came in) and notifyFormEdited below (the
 * form's structure changed) — both notify the same audience.
 */
export async function formManagerIds(form: { id: string; createdById: string }): Promise<Set<string>> {
  const viewerDepartments = await db.formViewerDepartment.findMany({ where: { formId: form.id }, select: { departmentId: true } });
  const departmentIds = viewerDepartments.map((v) => v.departmentId);
  const viewers = departmentIds.length
    ? await db.user.findMany({ where: { isActive: true, departmentId: { in: departmentIds } }, select: { id: true } })
    : [];
  return new Set([form.createdById, ...viewers.map((v) => v.id)]);
}

/**
 * Tells whoever manages this form's submissions that its structure changed.
 * Fired only on adding/removing a field (a deliberate, discrete action), not
 * on every autosaved keystroke in the title/description/field-label editors,
 * which would otherwise spam a notification per character typed.
 */
export async function notifyFormEdited(
  actor: PermissionUser & { name: string },
  form: { id: string; title: string; createdById: string },
  change: string
) {
  const recipientIds = await formManagerIds(form);
  recipientIds.delete(actor.id);

  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      notifyAndPush(
        userId,
        "form_edited",
        { formId: form.id, formTitle: form.title, actorName: actor.name, change },
        { title: "Form updated", body: `${actor.name} ${change} on "${form.title}"`, url: `/forms/${form.id}/edit`, tag: "form-edited" }
      )
    )
  );
}
