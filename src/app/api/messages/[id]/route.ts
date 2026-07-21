import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { emitToMembers, loadActionableMessage, memberIdsOf, messageInclude } from "@/lib/chat";
import { emitToUser } from "@/lib/socket-emit";

/**
 * DELETE ?scope=everyone — sender (or admin) tombstones the message for all.
 * DELETE ?scope=me      — hides it for the caller only.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const msg = await loadActionableMessage(user.id, id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = req.nextUrl.searchParams.get("scope") === "everyone" ? "everyone" : "me";

  if (scope === "everyone") {
    if (msg.senderId !== user.id && !isAdmin(user)) {
      return NextResponse.json({ error: "You can only delete your own messages for everyone" }, { status: 403 });
    }
    // Keep a tombstone so the thread can show "This message was deleted".
    await db.messageAttachment.deleteMany({ where: { messageId: id } });
    const updated = await db.message.update({
      where: { id },
      data: { deletedForEveryone: true, body: "", pinnedAt: null, pinnedById: null },
      include: messageInclude,
    });
    emitToMembers(await memberIdsOf(msg.conversationId), "message:update", {
      conversationId: msg.conversationId,
      message: updated,
    });
    return NextResponse.json({ message: updated });
  }

  await db.messageHidden.upsert({
    where: { messageId_userId: { messageId: id, userId: user.id } },
    create: { messageId: id, userId: user.id },
    update: {},
  });
  emitToUser(user.id, "message:hidden", { conversationId: msg.conversationId, messageId: id });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({ pinned: z.boolean() });

/** Pin / unpin a message (any member of the conversation). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const msg = await loadActionableMessage(user.id, id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await db.message.update({
    where: { id },
    data: parsed.data.pinned ? { pinnedAt: new Date(), pinnedById: user.id } : { pinnedAt: null, pinnedById: null },
    include: messageInclude,
  });

  emitToMembers(await memberIdsOf(msg.conversationId), "message:update", {
    conversationId: msg.conversationId,
    message: updated,
  });
  return NextResponse.json({ message: updated });
}
