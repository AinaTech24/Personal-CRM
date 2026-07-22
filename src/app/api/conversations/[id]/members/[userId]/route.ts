import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { emitToMembers, memberIdsOf } from "@/lib/chat";

const patchSchema = z.object({ isGroupAdmin: z.boolean() });

/**
 * Promote or demote a group admin.
 *
 * Allowed for existing group admins and for CRM admins — the latter so a group
 * whose only admin has left can always be recovered.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, userId } = await params;

  const conversation = await db.conversation.findUnique({
    where: { id },
    select: { id: true, type: true, isSystem: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conversation.type !== "GROUP") {
    return NextResponse.json({ error: "Only groups have admins" }, { status: 400 });
  }

  const [me, target] = await Promise.all([
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      select: { isGroupAdmin: true },
    }),
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
      select: { id: true, isGroupAdmin: true },
    }),
  ]);

  if (!me && !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!me?.isGroupAdmin && !isAdmin(user)) {
    return NextResponse.json({ error: "Only group admins can do this" }, { status: 403 });
  }
  if (!target) return NextResponse.json({ error: "Not a member of this group" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { isGroupAdmin } = parsed.data;

  // Don't let the last admin step down and strand the group. A CRM admin can
  // always recover it, but the group itself would have nobody in charge.
  if (!isGroupAdmin && target.isGroupAdmin) {
    const remaining = await db.conversationMember.count({
      where: { conversationId: id, isGroupAdmin: true, userId: { not: userId } },
    });
    if (remaining === 0) {
      return NextResponse.json({ error: "A group needs at least one admin" }, { status: 400 });
    }
  }

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId } },
    data: { isGroupAdmin },
  });

  // Everyone's copy of the group changes, not just the promoted member's.
  emitToMembers(await memberIdsOf(id), "conversation", { conversationId: id });

  return NextResponse.json({ ok: true });
}
