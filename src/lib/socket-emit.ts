import type { Server } from "socket.io";

declare global {
  var __io: Server | undefined;
  /** userId -> open socket count, maintained by server.js. */
  var __online: Map<string, number> | undefined;
}

/**
 * Is this user connected right now (any tab, any device)?
 *
 * Used to decide between an in-app toast and a push notification, so somebody
 * working in the CRM doesn't get their phone buzzing for a message that just
 * slid across their screen. Presence lives in the socket server's memory, so
 * this is only meaningful in the same process — which is where API routes run.
 */
export function isUserOnline(userId: string) {
  return (globalThis.__online?.get(userId) ?? 0) > 0;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  globalThis.__io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToDepartment(departmentId: string, event: string, payload: unknown) {
  globalThis.__io?.to(`dept:${departmentId}`).emit(event, payload);
}

export function emitToEntity(entity: string, entityId: string, event: string, payload: unknown) {
  globalThis.__io?.to(`${entity}:${entityId}`).emit(event, payload);
}

export function emitToAdmins(event: string, payload: unknown) {
  globalThis.__io?.to("admins").emit(event, payload);
}
