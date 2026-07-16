import type { InputJsonObject } from "@/generated/prisma/internal/prismaNamespace";
import { db } from "@/lib/db";
import { emitToUser } from "@/lib/socket-emit";

export async function notifyUser(userId: string, type: string, payload: InputJsonObject) {
  const notification = await db.notification.create({ data: { userId, type, payload } });
  emitToUser(userId, "notification", notification);
  return notification;
}
