import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/attendance";
import {
  assessmentBodySchema,
  broadcastConsultingChange,
  consultingUser,
  serializeAssessment,
  toJson,
} from "@/lib/consulting-store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("READ");
  if (!user) return error;

  const { id } = await params;
  const assessments = await db.consultingAssessment.findMany({ where: { engagementId: id }, orderBy: { assessedOn: "asc" } });
  return NextResponse.json({ assessments: assessments.map(serializeAssessment) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("CREATE");
  if (!user) return error;

  const { id } = await params;
  const engagement = await db.consultingEngagement.findUnique({ where: { id }, select: { id: true } });
  if (!engagement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = assessmentBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  // An annual re-score starts from the previous scores rather than blank,
  // so the consultant edits what changed instead of re-entering 65 rows.
  let data = parsed.data.data;
  if (!data) {
    const previous = await db.consultingAssessment.findFirst({ where: { engagementId: id }, orderBy: { assessedOn: "desc" } });
    data = (previous?.data as typeof data) ?? {};
  }

  const assessment = await db.consultingAssessment.create({
    data: {
      engagementId: id,
      label: parsed.data.label,
      assessedOn: dateFromKey(parsed.data.assessedOn),
      data: toJson(data ?? {}),
      createdById: user.id,
    },
  });

  await broadcastConsultingChange(id);
  return NextResponse.json({ assessment: serializeAssessment(assessment) }, { status: 201 });
}
