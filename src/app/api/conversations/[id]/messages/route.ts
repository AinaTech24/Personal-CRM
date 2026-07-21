import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { allowedMime, emitToMembers, isMember, memberIdsOf, messageInclude } from "@/lib/chat";
import { previewText, sendPushToUsers } from "@/lib/push";

/** Messages in a conversation (oldest→newest), minus ones this user deleted for themselves. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await isMember(user.id, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await db.message.findMany({
    where: { conversationId: id, hiddenFor: { none: { userId: user.id } } },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: messageInclude,
  });

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  // Tell the others their messages have now been seen.
  emitToMembers(await memberIdsOf(id), "read", { conversationId: id, userId: user.id, at: new Date().toISOString() });

  return NextResponse.json({ messages });
}

const MAX_ATTACH_BYTES = 10 * 1024 * 1024; // 10MB per file

const attachmentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(150),
  size: z.number().int().nonnegative().max(MAX_ATTACH_BYTES),
  data: z.string().min(1).max(15_000_000),
});

const bodySchema = z
  .object({
    body: z.string().max(5000).optional().default(""),
    attachments: z.array(attachmentSchema).max(10).optional().default([]),
    replyToId: z.string().optional().nullable(),
  })
  .refine((d) => d.body.trim().length > 0 || d.attachments.length > 0, { message: "Empty message" });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await isMember(user.id, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { body, attachments, replyToId } = parsed.data;

  if (attachments.some((a) => !allowedMime(a.mimeType))) {
    return NextResponse.json({ error: "Only images and documents are allowed (no video)." }, { status: 400 });
  }

  // A reply must point at a message in this same conversation.
  let validReplyTo: string | null = null;
  if (replyToId) {
    const parent = await db.message.findUnique({ where: { id: replyToId }, select: { conversationId: true } });
    if (parent?.conversationId === id) validReplyTo = replyToId;
  }

  const message = await db.message.create({
    data: {
      conversationId: id,
      senderId: user.id,
      body: body.trim(),
      replyToId: validReplyTo,
      attachments: attachments.length
        ? { create: attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, size: a.size, data: a.data })) }
        : undefined,
    },
    include: messageInclude,
  });

  await Promise.all([
    db.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  const members = await memberIdsOf(id);
  emitToMembers(members, "message", { conversationId: id, message });

  // Notify everyone else's devices, without making the sender wait on it.
  // Anyone with the app open already has the message via the socket above, and
  // a slow or unreachable push service must not stall — or fail — a send that
  // is already committed. Safe to leave running: this is a long-lived Node
  // server (server.js), not a function that gets frozen after the response.
  const recipients = members.filter((m) => m !== user.id);
  if (recipients.length) {
    const senderName = [user.name, user.surname].filter(Boolean).join(" ") || "Someone";
    const preview = previewText(message.body, message.attachments.length, message.attachments[0]?.name);

    void db.conversation
      .findUnique({ where: { id }, select: { type: true, title: true } })
      .then((conversation) => {
        // In a group the chat name is the useful heading and the sender goes
        // inline; in a direct chat the sender *is* the conversation.
        const isGroup = conversation?.type === "GROUP";
        return sendPushToUsers(recipients, {
          title: isGroup ? conversation?.title || "Group chat" : senderName,
          body: isGroup ? `${senderName}: ${preview}` : preview,
          url: `/messages?c=${id}`,
          tag: `conv-${id}`,
        });
      })
      .catch((err) => console.error("[push] message notification failed", err));
  }

  return NextResponse.json({ message }, { status: 201 });
}
