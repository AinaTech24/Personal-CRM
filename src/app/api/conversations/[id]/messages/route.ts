import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emitToMembers } from "@/lib/chat";

const messageInclude = {
  sender: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
  attachments: { select: { id: true, name: true, mimeType: true, size: true, data: true } },
};

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
    include: messageInclude,
  });

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ messages });
}

const MAX_ATTACH_BYTES = 10 * 1024 * 1024; // 10MB per file

/** Images and documents only — explicitly no video. */
function allowedMime(m: string) {
  if (m.startsWith("video/")) return false;
  if (m.startsWith("image/")) return true;
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

const attachmentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(150),
  size: z.number().int().nonnegative().max(MAX_ATTACH_BYTES),
  data: z.string().min(1).max(15_000_000), // base64 data URL (~1.37x the byte size)
});

const bodySchema = z
  .object({
    body: z.string().max(5000).optional().default(""),
    attachments: z.array(attachmentSchema).max(6).optional().default([]),
  })
  .refine((d) => d.body.trim().length > 0 || d.attachments.length > 0, { message: "Empty message" });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await membership(user.id, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { body, attachments } = parsed.data;

  if (attachments.some((a) => !allowedMime(a.mimeType))) {
    return NextResponse.json({ error: "Only images and documents are allowed (no video)." }, { status: 400 });
  }

  const message = await db.message.create({
    data: {
      conversationId: id,
      senderId: user.id,
      body: body.trim(),
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

  const members = await db.conversationMember.findMany({ where: { conversationId: id }, select: { userId: true } });
  emitToMembers(
    members.map((m) => m.userId),
    "message",
    { conversationId: id, message }
  );

  return NextResponse.json({ message }, { status: 201 });
}
