import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emitToMembers, loadActionableMessage, memberIdsOf, messageInclude } from "@/lib/chat";

const bodySchema = z.object({ emoji: z.string().min(1).max(8) });

/** Toggle one emoji reaction from the current user on a message. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const msg = await loadActionableMessage(user.id, id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { emoji } = parsed.data;

  const existing = await db.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: id, userId: user.id, emoji } },
    select: { id: true },
  });
  if (existing) await db.messageReaction.delete({ where: { id: existing.id } });
  else await db.messageReaction.create({ data: { messageId: id, userId: user.id, emoji } });

  const updated = await db.message.findUnique({ where: { id }, include: messageInclude });
  emitToMembers(await memberIdsOf(msg.conversationId), "message:update", {
    conversationId: msg.conversationId,
    message: updated,
  });
  return NextResponse.json({ message: updated });
}
