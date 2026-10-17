import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/attendance";
import type { RegisterKind } from "@/lib/consulting";
import {
  assertActiveUser,
  broadcastConsultingChange,
  closedAtFor,
  consultingUser,
  itemInclude,
  itemPatchSchema,
  serializeItem,
  toJson,
  validateItemForKind,
} from "@/lib/consulting-store";

type Params = { params: Promise<{ itemId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("UPDATE");
  if (!user) return error;

  const { itemId } = await params;
  const existing = await db.consultingRegisterItem.findUnique({ where: { id: itemId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const kind = existing.kind as RegisterKind;

  const parsed = itemPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const checked = validateItemForKind(kind, d.status, d.details);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (!(await assertActiveUser(d.ownerId))) return NextResponse.json({ error: "Owner must be an active user" }, { status: 400 });

  const item = await db.consultingRegisterItem.update({
    where: { id: itemId },
    data: {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.status !== undefined && { status: d.status, closedAt: closedAtFor(kind, d.status, existing.closedAt) }),
      ...(d.priority !== undefined && { priority: d.priority }),
      ...(d.ownerId !== undefined && { ownerId: d.ownerId }),
      ...(d.ownerName !== undefined && { ownerName: d.ownerName }),
      ...(d.dueDate !== undefined && { dueDate: d.dueDate ? dateFromKey(d.dueDate) : null }),
      ...(checked.details !== undefined && { details: toJson(checked.details) }),
    },
    include: itemInclude,
  });

  await broadcastConsultingChange(existing.engagementId);
  return NextResponse.json({ item: serializeItem(item) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("DELETE");
  if (!user) return error;

  const { itemId } = await params;
  const existing = await db.consultingRegisterItem.findUnique({ where: { id: itemId }, select: { engagementId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.consultingRegisterItem.delete({ where: { id: itemId } });
  await broadcastConsultingChange(existing.engagementId);
  return NextResponse.json({ ok: true });
}
