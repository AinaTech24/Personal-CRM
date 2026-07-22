import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { emitToMembers, isMember, memberIdsOf, postSystemMessage, hasGroupAdmin } from "@/lib/chat";

/**
 * Permanently delete a conversation and everything in it.
 *
 * The auto-managed "Aina Family" group can't be deleted — every user belongs to
 * it and it would simply be recreated. Groups are admin-only; a direct chat can
 * be removed by either participant.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const conversation = await db.conversation.findUnique({
    where: { id },
    select: { id: true, type: true, isSystem: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isMember(user.id, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (conversation.isSystem) {
    return NextResponse.json({ error: "The Aina Family group can't be deleted" }, { status: 400 });
  }
  if (conversation.type === "GROUP" && !isAdmin(user)) {
    return NextResponse.json({ error: "Only admins can delete a group" }, { status: 403 });
  }

  // Tell everyone before the rows disappear.
  const members = await memberIdsOf(id);
  await db.conversation.delete({ where: { id } });
  emitToMembers(members, "conversation:deleted", { conversationId: id });

  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(1000).nullable().optional(),
  // base64 data URL, or null to clear the picture
  imageDataUrl: z.string().max(3_000_000).nullable().optional(),
});

/** Admins (and super admins) edit a group's name, picture and description. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const conversation = await db.conversation.findUnique({ where: { id }, select: { id: true, type: true } });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conversation.type !== "GROUP") {
    return NextResponse.json({ error: "Only groups have editable info" }, { status: 400 });
  }
  // A group's own admins can edit it; CRM admins can edit any group.
  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    select: { isGroupAdmin: true, adminUntil: true },
  });
  if (!membership && !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!hasGroupAdmin(membership) && !isAdmin(user)) {
    return NextResponse.json({ error: "Only group admins can edit group info" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  if (d.imageDataUrl && !/^data:image\//.test(d.imageDataUrl)) {
    return NextResponse.json({ error: "Group picture must be an image" }, { status: 400 });
  }

  const before = await db.conversation.findUnique({
    where: { id },
    select: { title: true, description: true, imageDataUrl: true },
  });

  const updated = await db.conversation.update({
    where: { id },
    data: {
      ...(d.title !== undefined ? { title: d.title.trim() } : {}),
      ...(d.description !== undefined ? { description: d.description?.trim() || null } : {}),
      ...(d.imageDataUrl !== undefined ? { imageDataUrl: d.imageDataUrl } : {}),
    },
    select: { id: true, title: true, description: true, imageDataUrl: true },
  });

  // Everyone's conversation list needs the new name/picture.
  emitToMembers(await memberIdsOf(id), "conversation", { conversationId: id });

  // One notice per thing that changed, so the thread reads as a history rather
  // than a vague "group updated".
  const who = [user.name, user.surname].filter(Boolean).join(" ") || "Someone";
  if (before && updated.title !== before.title) {
    await postSystemMessage(id, `${who} renamed the group to "${updated.title}"`, user.id);
  }
  if (before && updated.description !== before.description) {
    await postSystemMessage(
      id,
      updated.description ? `${who} updated the group description` : `${who} removed the group description`,
      user.id
    );
  }
  if (before && updated.imageDataUrl !== before.imageDataUrl) {
    await postSystemMessage(
      id,
      updated.imageDataUrl ? `${who} changed the group photo` : `${who} removed the group photo`,
      user.id
    );
  }

  return NextResponse.json({ conversation: updated });
}
