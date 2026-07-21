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

/** Attachments are images, audio (voice notes) and documents — never video. */
export function allowedMime(m: string) {
  if (m.startsWith("video/")) return false;
  if (m.startsWith("image/")) return true;
  if (m.startsWith("audio/")) return true;
  const docPrefixes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/rtf",
    "application/zip",
    "application/x-zip-compressed",
    "text/",
  ];
  return docPrefixes.some((p) => m.startsWith(p));
}

/** Everything a message bubble needs: sender, files, reactions and the quoted parent. */
export const messageInclude = {
  sender: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
  attachments: { select: { id: true, name: true, mimeType: true, size: true, data: true } },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedForEveryone: true,
      sender: { select: { name: true, surname: true } },
      attachments: { select: { name: true, mimeType: true } },
    },
  },
} as const;

/** Is this user a member of the conversation? */
export async function isMember(userId: string, conversationId: string) {
  const m = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return !!m;
}

export async function memberIdsOf(conversationId: string) {
  const rows = await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

/** Load a message the user is allowed to act on, with its conversation members. */
export async function loadActionableMessage(userId: string, messageId: string) {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, conversationId: true, deletedForEveryone: true, pinnedAt: true },
  });
  if (!message) return null;
  if (!(await isMember(userId, message.conversationId))) return "forbidden" as const;
  return message;
}
