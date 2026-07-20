import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { canManageRecord, isAdmin, isSuperAdmin } from "@/lib/permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";

export async function getLeadForUser(user: PermissionUser, leadId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  if (!canManageRecord(user, lead)) return "forbidden" as const;
  return lead;
}

/** Deletion is more sensitive than editing — restrict it to Admins and the lead's creator. */
export function canDeleteLead(user: PermissionUser, lead: { createdById: string }) {
  return isAdmin(user) || lead.createdById === user.id;
}

/**
 * A lead should be visible to a department user if it's in their department,
 * unassigned to any department, OR they personally created/were assigned it
 * (e.g. a Super Admin assigning across departments) — matching the single-lead
 * access rule in `canManageRecord`, which already accounts for assignment.
 */
export function leadListWhere(user: PermissionUser) {
  if (isSuperAdmin(user) || isAdmin(user)) return {};
  return {
    OR: [
      { departmentId: user.departmentId },
      { departmentId: null },
      { assignedToId: user.id },
      { createdById: user.id },
    ],
  };
}

/**
 * Push a live "the leads list changed" signal to everyone who should see it:
 * the assignee (so it appears the instant they're assigned, even if their
 * department differs), the lead's department room, and all Admins/Super
 * Admins (who can see every lead regardless of department).
 */
export function broadcastLeadChange(
  event: "lead_created" | "lead_updated" | "lead_deleted",
  lead: { id: string; departmentId: string | null; assignedToId: string | null }
) {
  if (lead.assignedToId) emitToUser(lead.assignedToId, event, { leadId: lead.id });
  if (lead.departmentId) emitToDepartment(lead.departmentId, event, { leadId: lead.id });
  emitToAdmins(event, { leadId: lead.id });
}

export async function assignableUsersFor(user: PermissionUser, opts?: { allActive?: boolean }) {
  const admin = isAdmin(user);
  // Super Admins are only offered as an assignee to admins; regular users never
  // see them in assignment pickers.
  const roleFilter = admin ? {} : { role: { not: "SUPER_ADMIN" as const } };
  // Admins always see everyone; other modules (e.g. task assignment) can opt in
  // to the full active-user list so any user can be assigned across departments.
  if (opts?.allActive || admin) {
    return db.user.findMany({
      where: { isActive: true, ...roleFilter },
      select: { id: true, name: true, email: true, departmentId: true },
      orderBy: { name: "asc" },
    });
  }
  return db.user.findMany({
    where: { isActive: true, departmentId: user.departmentId, ...roleFilter },
    select: { id: true, name: true, email: true, departmentId: true },
    orderBy: { name: "asc" },
  });
}
