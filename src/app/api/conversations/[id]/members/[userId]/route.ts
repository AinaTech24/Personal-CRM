import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { emitToMembers, memberIdsOf, postSystemMessage, hasGroupAdmin } from "@/lib/chat";

const patchSchema = z.object({
  isGroupAdmin: z.boolean(),
  /** ISO date; the grant lapses then. Omitted means indefinite. */
  until: z.string().datetime().nullable().optional(),
});

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

  const [me, target_] = await Promise.all([
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      select: { isGroupAdmin: true, adminUntil: true },
    }),
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
      select: { id: true, isGroupAdmin: true, adminUntil: true, user: { select: { name: true, surname: true } } },
    }),
  ]);

  if (!me && !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!hasGroupAdmin(me) && !isAdmin(user)) {
    return NextResponse.json({ error: "Only group admins can do this" }, { status: 403 });
  }
  if (!target_) return NextResponse.json({ error: "Not a member of this group" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { isGroupAdmin, until } = parsed.data;
  const expiresAt = isGroupAdmin && until ? new Date(until) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "That time has already passed" }, { status: 400 });
  }

  // Don't let the last admin step down and strand the group. A CRM admin can
  // always recover it, but the group itself would have nobody in charge.
  if (!isGroupAdmin && target_.isGroupAdmin) {
    const remaining = await db.conversationMember.count({
      where: { conversationId: id, isGroupAdmin: true, userId: { not: userId } },
    });
    if (remaining === 0) {
      return NextResponse.json({ error: "A group needs at least one admin" }, { status: 400 });
    }
  }

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId } },
    data: { isGroupAdmin, adminUntil: expiresAt },
  });

  // Everyone's copy of the group changes, not just the promoted member's.
  emitToMembers(await memberIdsOf(id), "conversation", { conversationId: id });

  const who = [user.name, user.surname].filter(Boolean).join(" ") || "Someone";
  const target = [target_.user.name, target_.user.surname].filter(Boolean).join(" ") || "someone";
  await postSystemMessage(
    id,
    isGroupAdmin
      ? expiresAt
        ? `${who} made ${target} an admin until ${expiresAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
        : `${who} made ${target} an admin`
      : `${who} removed ${target} as an admin`,
    user.id
  );

  return NextResponse.json({ ok: true });
}
