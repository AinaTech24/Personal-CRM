import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { addUserToAinaFamily, emitToMembers } from "@/lib/chat";

// Enough for the in-chat "Info" card — you already share a conversation with them.
const memberSelect = {
  select: {
    id: true,
    name: true,
    surname: true,
    avatarDataUrl: true,
    role: true,
    email: true,
    mobile: true,
    department: { select: { id: true, name: true } },
  },
};

/** Shape a conversation for the client: resolve the display title and unread count. */
function serialize(
  conv: {
    id: string;
    type: "DIRECT" | "GROUP";
    title: string | null;
    isSystem: boolean;
    description: string | null;
    imageDataUrl: string | null;
    updatedAt: Date;
    members: {
      userId: string;
      lastReadAt: Date | null;
      user: {
        id: string;
        name: string;
        surname: string | null;
        avatarDataUrl: string | null;
        role: string;
        email: string;
        mobile: string | null;
        department: { id: string; name: string } | null;
      };
    }[];
    messages: { id: string; body: string; createdAt: Date; senderId: string; sender: { name: string } }[];
  },
  meId: string
) {
  const me = conv.members.find((m) => m.userId === meId);
  const others = conv.members.filter((m) => m.userId !== meId).map((m) => m.user);
  const last = conv.messages[0] ?? null;
  const title = conv.type === "GROUP" ? conv.title ?? "Group" : others[0] ? [others[0].name, others[0].surname].filter(Boolean).join(" ") : "Unknown";
  // A direct chat borrows the other person's photo, the same way it already
  // borrows their name — the conversation row itself only has a picture when
  // it's a group, which left every DM on a fallback initial.
  const imageDataUrl = conv.type === "GROUP" ? conv.imageDataUrl : others[0]?.avatarDataUrl ?? null;
  const unread = last && me && (!me.lastReadAt || last.createdAt > me.lastReadAt) && last.senderId !== meId ? 1 : 0;
  return {
    id: conv.id,
    type: conv.type,
    isSystem: conv.isSystem,
    description: conv.description,
    imageDataUrl,
    title,
    members: conv.members.map((m) => m.user),
    // When each member last opened the thread — drives the "Seen" tick.
    reads: conv.members.map((m) => ({ userId: m.userId, lastReadAt: m.lastReadAt })),
    lastMessage: last ? { body: last.body, senderName: last.sender.name, createdAt: last.createdAt } : null,
    updatedAt: conv.updatedAt,
    unread,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Every user belongs to Aina Family; ensure it and their membership lazily.
  await addUserToAinaFamily(user.id);

  const memberships = await db.conversationMember.findMany({
    where: { userId: user.id },
    include: {
      conversation: {
        include: {
          members: { include: { user: memberSelect } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { name: true } } } },
        },
      },
    },
  });

  const conversations = memberships
    .map((m) => serialize(m.conversation, user.id))
    // System group pinned first, then most recently active.
    .sort((a, b) => (Number(b.isSystem) - Number(a.isSystem)) || (b.updatedAt.getTime() - a.updatedAt.getTime()));

  return NextResponse.json({ conversations });
}

const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GROUP"), title: z.string().min(1).max(120), memberIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("DIRECT"), userId: z.string().min(1) }),
]);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  if (d.type === "GROUP") {
    if (!isAdmin(user)) return NextResponse.json({ error: "Only admins can create groups" }, { status: 403 });
    const memberIds = [...new Set([...d.memberIds, user.id])];
    const conv = await db.conversation.create({
      data: {
        type: "GROUP",
        title: d.title.trim(),
        createdById: user.id,
        members: { create: memberIds.map((id) => ({ userId: id })) },
      },
    });
    emitToMembers(memberIds, "conversation", { id: conv.id });
    return NextResponse.json({ id: conv.id }, { status: 201 });
  }

  // DIRECT: reuse an existing 1:1 between these two users if one exists.
  if (d.userId === user.id) return NextResponse.json({ error: "You can't message yourself" }, { status: 400 });
  const other = await db.user.findUnique({ where: { id: d.userId }, select: { id: true } });
  if (!other) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const existing = await db.conversation.findFirst({
    where: {
      type: "DIRECT",
      AND: [{ members: { some: { userId: user.id } } }, { members: { some: { userId: other.id } } }],
    },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ id: existing.id });

  const conv = await db.conversation.create({
    data: {
      type: "DIRECT",
      createdById: user.id,
      members: { create: [{ userId: user.id }, { userId: other.id }] },
    },
  });
  emitToMembers([user.id, other.id], "conversation", { id: conv.id });
  return NextResponse.json({ id: conv.id }, { status: 201 });
}
