import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/attendance";
import {
  assessmentPatchSchema,
  broadcastConsultingChange,
  consultingUser,
  serializeAssessment,
  toJson,
} from "@/lib/consulting-store";

type Params = { params: Promise<{ assessmentId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("UPDATE");
  if (!user) return error;

  const { assessmentId } = await params;
  const existing = await db.consultingAssessment.findUnique({ where: { id: assessmentId }, select: { engagementId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = assessmentPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const assessment = await db.consultingAssessment.update({
    where: { id: assessmentId },
    data: {
      ...(d.label !== undefined && { label: d.label }),
      ...(d.assessedOn !== undefined && { assessedOn: dateFromKey(d.assessedOn) }),
      ...(d.data !== undefined && { data: toJson(d.data) }),
    },
  });

  await broadcastConsultingChange(existing.engagementId);
  return NextResponse.json({ assessment: serializeAssessment(assessment) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("DELETE");
  if (!user) return error;

  const { assessmentId } = await params;
  const existing = await db.consultingAssessment.findUnique({ where: { id: assessmentId }, select: { engagementId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.consultingAssessment.delete({ where: { id: assessmentId } });
  await broadcastConsultingChange(existing.engagementId);
  return NextResponse.json({ ok: true });
}
