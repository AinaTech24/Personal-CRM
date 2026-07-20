import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emitToMembers } from "@/lib/chat";

async function membership(userId: string, conversationId: string) {
  return db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
}

/** Messages in a conversation (oldest→newest). Opening it marks the member read. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await membership(user.id, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await db.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: { sender: { select: { id: true, name: true, surname: true, avatarDataUrl: true } } },
  });

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ messages });
}

const bodySchema = z.object({ body: z.string().min(1).max(5000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await membership(user.id, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const message = await db.message.create({
    data: { conversationId: id, senderId: user.id, body: parsed.data.body.trim() },
    include: { sender: { select: { id: true, name: true, surname: true, avatarDataUrl: true } } },
  });

  // Bump the conversation and mark the sender caught up.
  await Promise.all([
    db.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  // Real-time: push to every member (including the sender's other tabs).
  const members = await db.conversationMember.findMany({ where: { conversationId: id }, select: { userId: true } });
  emitToMembers(
    members.map((m) => m.userId),
    "message",
    { conversationId: id, message }
  );

  return NextResponse.json({ message }, { status: 201 });
}
