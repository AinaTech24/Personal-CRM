import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { emitToMembers, groupAdminStatus, loadActionableMessage, memberIdsOf, messageInclude } from "@/lib/chat";
import { emitToUser } from "@/lib/socket-emit";

/**
 * DELETE ?scope=everyone — sender, a company admin, or (in a group) that
 * group's own admin tombstones the message for all.
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
      const { isGroup, isGroupAdmin } = await groupAdminStatus(user.id, msg.conversationId);
      if (!isGroup || !isGroupAdmin) {
        return NextResponse.json({ error: "You can only delete your own messages for everyone" }, { status: 403 });
      }
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

const patchSchema = z.object({
  pinned: z.boolean().optional(),
  body: z.string().trim().min(1).max(10_000).optional(),
});

/**
 * Pin/unpin — any member in a DM (there's no "admin" concept for a 2-person
 * thread), but only that group's own admin (or a company admin) in a GROUP
 * conversation, so pins there don't turn into a free-for-all.
 *
 * Edit `body` — the sender only, on their own non-deleted, non-system
 * message. No time limit and no "originally said" history kept — editedAt
 * just flips from null to the edit time, shown in the thread as a small
 * "edited" marker.
 *
 * The two are independent — either field, or both, can be sent in one call.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const msg = await loadActionableMessage(user.id, id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;
  if (d.pinned === undefined && d.body === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const data: { pinnedAt?: Date | null; pinnedById?: string | null; body?: string; editedAt?: Date } = {};

  if (d.pinned !== undefined) {
    if (!isAdmin(user)) {
      const { isGroup, isGroupAdmin } = await groupAdminStatus(user.id, msg.conversationId);
      if (isGroup && !isGroupAdmin) {
        return NextResponse.json({ error: "Only a group admin can pin messages here" }, { status: 403 });
      }
    }
    if (d.pinned) {
      data.pinnedAt = new Date();
      data.pinnedById = user.id;
    } else {
      data.pinnedAt = null;
      data.pinnedById = null;
    }
  }

  if (d.body !== undefined) {
    if (msg.senderId !== user.id) return NextResponse.json({ error: "You can only edit your own messages" }, { status: 403 });
    if (msg.isSystem) return NextResponse.json({ error: "Can't edit a system message" }, { status: 400 });
    if (msg.deletedForEveryone) return NextResponse.json({ error: "Can't edit a deleted message" }, { status: 400 });
    data.body = d.body;
    data.editedAt = new Date();
  }

  const updated = await db.message.update({ where: { id }, data, include: messageInclude });

  emitToMembers(await memberIdsOf(msg.conversationId), "message:update", {
    conversationId: msg.conversationId,
    message: updated,
  });
  return NextResponse.json({ message: updated });
}
