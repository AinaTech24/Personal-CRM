import { db } from "@/lib/db";
import { emitToUser } from "@/lib/socket-emit";

export const AINA_FAMILY_TITLE = "Aina Family";

/**
 * Find or create the auto-managed "Aina Family" group. On first creation it is
 * seeded with every active user, so the whole team is in it from the start.
 */
export async function ensureAinaFamily() {
  const existing = await db.conversation.findFirst({ where: { isSystem: true, type: "GROUP" } });
  if (existing) return existing;
  const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } });
  return db.conversation.create({
    data: {
      type: "GROUP",
      title: AINA_FAMILY_TITLE,
      isSystem: true,
      members: { create: users.map((u) => ({ userId: u.id })) },
    },
  });
}

/** Ensure a user belongs to the Aina Family group (idempotent). New accounts call this. */
export async function addUserToAinaFamily(userId: string) {
  const fam = await ensureAinaFamily();
  await db.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: fam.id, userId } },
    create: { conversationId: fam.id, userId },
    update: {},
  });
  return fam;
}

/** Real-time: deliver an event to every member's personal socket room. */
export function emitToMembers(memberUserIds: string[], event: string, payload: unknown) {
  for (const id of memberUserIds) emitToUser(id, event, payload);
}
