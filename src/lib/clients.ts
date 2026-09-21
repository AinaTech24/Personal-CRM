import { db } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin, isAnalyst } from "@/lib/permissions";
import { emitToAdmins, emitToDepartment, emitToUser } from "@/lib/socket-emit";

/**
 * A client is visible to a department user if it's in their department, or
 * they personally created/were assigned it — same shape as leadListWhere.
 * Admins and Analysts (read-only) see every client regardless of department.
 */
export function clientListWhere(user: PermissionUser) {
  if (isAdmin(user) || isAnalyst(user)) return {};
  return {
    OR: [
      { departmentId: user.departmentId ?? "__none__" },
      { createdById: user.id },
      { assignedToId: user.id },
    ],
  };
}

export async function getClientForUser(user: PermissionUser, clientId: string) {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return null;

  const allowed =
    isAdmin(user) ||
    // Read-only, company-wide — PATCH/DELETE routes explicitly block
    // isAnalystOnly() callers even though this lets them past this check.
    isAnalyst(user) ||
    client.createdById === user.id ||
    client.assignedToId === user.id ||
    (!!client.departmentId && client.departmentId === user.departmentId);

  return allowed ? client : ("forbidden" as const);
}

/** Deletion is more sensitive than editing — restrict it to Admins and the client's creator. */
export function canDeleteClient(user: PermissionUser, client: { createdById: string }) {
  return isAdmin(user) || client.createdById === user.id;
}

export function broadcastClientChange(
  event: "client_created" | "client_updated" | "client_deleted",
  client: { id: string; departmentId: string | null; assignedToId: string | null }
) {
  if (client.assignedToId) emitToUser(client.assignedToId, event, { clientId: client.id });
  if (client.departmentId) emitToDepartment(client.departmentId, event, { clientId: client.id });
  emitToAdmins(event, { clientId: client.id });
}
