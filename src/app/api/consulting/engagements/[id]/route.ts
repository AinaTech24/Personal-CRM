import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertActiveUser,
  broadcastConsultingChange,
  consultingUser,
  engagementData,
  engagementHealth,
  engagementInclude,
  engagementPatchSchema,
  serializeEngagement,
} from "@/lib/consulting-store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("READ");
  if (!user) return error;

  const { id } = await params;
  const engagement = await db.consultingEngagement.findUnique({ where: { id }, include: engagementInclude });
  if (!engagement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const health = await engagementHealth([id]);
  return NextResponse.json({ engagement: { ...serializeEngagement(engagement), health: health.get(id) } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("UPDATE");
  if (!user) return error;

  const { id } = await params;
  const existing = await db.consultingEngagement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = engagementPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await assertActiveUser(parsed.data.leadConsultantId))) {
    return NextResponse.json({ error: "Lead consultant must be an active user" }, { status: 400 });
  }

  const engagement = await db.consultingEngagement.update({
    where: { id },
    data: engagementData(parsed.data),
    include: engagementInclude,
  });

  await broadcastConsultingChange(id);
  return NextResponse.json({ engagement: serializeEngagement(engagement) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("DELETE");
  if (!user) return error;

  const { id } = await params;
  const existing = await db.consultingEngagement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Stages, register items and assessments cascade with it.
  await db.consultingEngagement.delete({ where: { id } });
  await broadcastConsultingChange(id);
  return NextResponse.json({ ok: true });
}
