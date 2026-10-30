import { db } from "@/lib/db";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import { combinedTeamScopeFor } from "@/lib/team-scope";
import { canManageModule } from "@/lib/module-permissions-store";
import { TRASH_RETENTION_DAYS, trashExpiresAt, type TrashActionResult, type TrashItem } from "@/lib/trash-types";

/**
 * Same shape as taskListWhere/projectListWhere — "own record" for a call is
 * being its owner (who took/made it) or the one who logged it, which can
 * differ (e.g. an admin logging a call on a rep's behalf).
 *
 * `hasGrant` is this user's Permission Manager CALLS grant for the action in
 * play (checked by the caller — a DB call, so it stays out of this pure
 * function), widening to every call the same way isAdmin already does. Call
 * has no department of its own to scope a grant to, so it's flat: the whole
 * list, or just what you'd see without one.
 */
export function callListWhere(
  user: PermissionUser,
  teamUserIds?: string[] | null,
  teamOnly?: boolean,
  hasGrant?: boolean,
  opts?: { trashed?: boolean }
) {
  let scope: object;
  if (teamOnly && teamUserIds) {
    scope = { OR: [{ ownerId: { in: teamUserIds } }, { createdById: { in: teamUserIds } }] };
  } else if (isAdmin(user) || hasGrant) {
    scope = {};
  } else {
    const or: object[] = [{ ownerId: user.id }, { createdById: user.id }];
    if (teamUserIds && teamUserIds.length > 0) {
      or.push({ ownerId: { in: teamUserIds } }, { createdById: { in: teamUserIds } });
    }
    scope = { OR: or };
  }
  return { AND: [scope, { deletedAt: opts?.trashed ? { not: null } : null }] };
}

/** An admin, a CALLS grant holder, a CRM lead over the call's owner/creator, or whoever owns/logged the call themselves. */
export function canManageCall(
  user: PermissionUser,
  call: { ownerId: string; createdById: string },
  teamUserIds: string[] | null,
  hasGrant?: boolean
): boolean {
  if (isAdmin(user) || hasGrant) return true;
  if (call.ownerId === user.id || call.createdById === user.id) return true;
  return !!teamUserIds && (teamUserIds.includes(call.ownerId) || teamUserIds.includes(call.createdById));
}

/**
 * Deletion is narrower than editing, same as Leads/Tasks/Projects: an admin,
 * a CALLS grant holder, a CRM lead over the call's creator, or whoever
 * actually logged it — not just whoever it's attributed to as "owner"
 * (which can be set to anyone, e.g. an admin logging a call on a rep's
 * behalf), who could otherwise erase a call log they never created.
 */
export function canDeleteCall(
  user: PermissionUser,
  call: { createdById: string },
  teamUserIds: string[] | null,
  hasGrant?: boolean
): boolean {
  if (isAdmin(user) || hasGrant) return true;
  if (call.createdById === user.id) return true;
  return !!teamUserIds && teamUserIds.includes(call.createdById);
}

export function broadcastCallChange(
  event: "call_created" | "call_updated" | "call_deleted",
  call: { id: string; ownerId: string; createdById: string }
) {
  emitToUser(call.ownerId, event, { callId: call.id });
  if (call.createdById !== call.ownerId) emitToUser(call.createdById, event, { callId: call.id });
  emitToAdmins(event, { callId: call.id });
}

/* ------------------------------- Trash ------------------------------- */

/** Every trashed call this user can see — same visibility rule as the live list. */
export async function listTrashedCallsFor(user: PermissionUser): Promise<TrashItem[]> {
  const [teamUserIds, hasGrant] = await Promise.all([combinedTeamScopeFor(user), canManageModule(user, "CALLS", "READ")]);
  const calls = await db.call.findMany({
    where: callListWhere(user, teamUserIds, false, hasGrant, { trashed: true }),
    include: { deletedBy: { select: { id: true, name: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return calls.map((c) => ({
    id: c.id,
    module: "calls",
    moduleLabel: "Calls",
    title: c.subject || c.clientName || "Call",
    subtitle: c.clientName && c.subject ? c.clientName : null,
    deletedAt: c.deletedAt!.toISOString(),
    deletedBy: c.deletedBy,
    expiresAt: trashExpiresAt(c.deletedAt!).toISOString(),
  }));
}

/** Clears the trash flag, putting the call back exactly as it was. */
export async function restoreCall(user: PermissionUser, callId: string): Promise<TrashActionResult> {
  const call = await db.call.findUnique({ where: { id: callId } });
  if (!call || !call.deletedAt) return "not_found";

  const [teamUserIds, hasGrant] = await Promise.all([combinedTeamScopeFor(user), canManageModule(user, "CALLS", "DELETE")]);
  if (!canDeleteCall(user, call, teamUserIds, hasGrant)) return "forbidden";

  const restored = await db.call.update({ where: { id: callId }, data: { deletedAt: null, deletedById: null } });
  broadcastCallChange("call_created", restored);
  return "ok";
}

/** Same permission as deleting it in the first place. */
export async function purgeCall(user: PermissionUser, callId: string): Promise<TrashActionResult> {
  const call = await db.call.findUnique({ where: { id: callId } });
  if (!call || !call.deletedAt) return "not_found";

  const [teamUserIds, hasGrant] = await Promise.all([combinedTeamScopeFor(user), canManageModule(user, "CALLS", "DELETE")]);
  if (!canDeleteCall(user, call, teamUserIds, hasGrant)) return "forbidden";

  await db.call.delete({ where: { id: callId } });
  return "ok";
}

/** The 30-day auto-purge job's actual work. */
export async function purgeExpiredCalls(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.call.deleteMany({ where: { deletedAt: { lte: cutoff } } });
  return count;
}
