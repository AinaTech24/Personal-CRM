import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emitToMembers, isMember, memberIdsOf, messageInclude } from "@/lib/chat";

const bodySchema = z.object({
  messageId: z.string().min(1),
  conversationIds: z.array(z.string().min(1)).min(1).max(20),
});

/** Copy a message (text + files) into other conversations the user belongs to. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { messageId, conversationIds } = parsed.data;

  const source = await db.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { name: true, surname: true } },
      attachments: { select: { name: true, mimeType: true, size: true, data: true } },
    },
  });
  if (!source || source.deletedForEveryone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isMember(user.id, source.conversationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const originalSender = [source.sender.name, source.sender.surname].filter(Boolean).join(" ");

  // Membership checks for every target conversation run together, not one at
  // a time — same for each conversation's create/update/broadcast below. At
  // the max of 20 targets, the old sequential version awaited ~80 DB round
  // trips back to back; this does the same work in a handful of parallel
  // batches instead.
  const memberships = await Promise.all(conversationIds.map((id) => isMember(user.id, id)));
  const targetIds = conversationIds.filter((_, i) => memberships[i]);

  await Promise.all(
    targetIds.map(async (conversationId) => {
      const [message] = await Promise.all([
        db.message.create({
          data: {
            conversationId,
            senderId: user.id,
            body: source.body,
            forwardedFromName: source.forwardedFromName ?? originalSender,
            attachments: source.attachments.length
              ? { create: source.attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, size: a.size, data: a.data })) }
              : undefined,
          },
          include: messageInclude,
        }),
        db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
      ]);
      emitToMembers(await memberIdsOf(conversationId), "message", { conversationId, message });
    })
  );

  return NextResponse.json({ forwarded: targetIds.length });
}
