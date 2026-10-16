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
  // This runs on every conversations fetch, so only announce a genuinely new
  // membership — otherwise the group fills with "joined" notices on every load.
  const existing = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: fam.id, userId } },
    select: { id: true },
  });
  if (!existing) {
    await db.conversationMember.create({ data: { conversationId: fam.id, userId } });
    const person = await db.user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
    const who = [person?.name, person?.surname].filter(Boolean).join(" ") || "Someone";
    await postSystemMessage(fam.id, `${who} joined`, userId);
  }
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

/**
 * Posts a notice into a conversation — "X was added", "Y renamed the group".
 *
 * Written as a real message so it lands in the thread in chronological order
 * and arrives over the same socket event as anything else; the isSystem flag is
 * what changes how it renders.
 *
 * Never throws. A notice failing must not fail the change it describes.
 */
export async function postSystemMessage(conversationId: string, body: string, actorId: string) {
  try {
    const message = await db.message.create({
      data: { conversationId, senderId: actorId, body, isSystem: true },
      include: messageInclude,
    });
    await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, title: true },
    });
    emitToMembers(await memberIdsOf(conversationId), "message", { conversationId, message, conversation });
  } catch (err) {
    console.error("[chat] system message failed", err);
  }
}

/** Someone's group-admin rights, honouring a temporary grant that has lapsed. */
export function hasGroupAdmin(member: { isGroupAdmin: boolean; adminUntil: Date | null } | null | undefined) {
  if (!member?.isGroupAdmin) return false;
  return !member.adminUntil || member.adminUntil > new Date();
}

/**
 * Whether `userId` is a currently-active group admin of `conversationId`,
 * and whether that conversation is even a group — a DM has no admin concept
 * at all, so callers moderating group-only actions (pinning, deleting
 * someone else's message for everyone) should only enforce the admin check
 * when `isGroup` is true.
 */
export async function groupAdminStatus(userId: string, conversationId: string): Promise<{ isGroup: boolean; isGroupAdmin: boolean }> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      members: { where: { userId }, select: { isGroupAdmin: true, adminUntil: true }, take: 1 },
    },
  });
  if (!conversation) return { isGroup: false, isGroupAdmin: false };
  return { isGroup: conversation.type === "GROUP", isGroupAdmin: hasGroupAdmin(conversation.members[0]) };
}
