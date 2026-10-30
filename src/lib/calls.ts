import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";

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
export function callListWhere(user: PermissionUser, teamUserIds?: string[] | null, teamOnly?: boolean, hasGrant?: boolean) {
  if (teamOnly && teamUserIds) {
    return { OR: [{ ownerId: { in: teamUserIds } }, { createdById: { in: teamUserIds } }] };
  }
  if (isAdmin(user) || hasGrant) return {};
  const or: object[] = [{ ownerId: user.id }, { createdById: user.id }];
  if (teamUserIds && teamUserIds.length > 0) {
    or.push({ ownerId: { in: teamUserIds } }, { createdById: { in: teamUserIds } });
  }
  return { OR: or };
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
