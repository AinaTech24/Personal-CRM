import type { Server } from "socket.io";

declare global {
  var __io: Server | undefined;
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
