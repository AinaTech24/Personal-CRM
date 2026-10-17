import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertActiveUser,
  broadcastConsultingChange,
  consultingUser,
  engagementBodySchema,
  engagementData,
  engagementHealth,
  engagementInclude,
  initialStages,
  serializeEngagement,
} from "@/lib/consulting-store";

export async function GET() {
  const { user, error } = await consultingUser("READ");
  if (!user) return error;

  const engagements = await db.consultingEngagement.findMany({ include: engagementInclude, orderBy: { updatedAt: "desc" } });
  const health = await engagementHealth(engagements.map((e) => e.id));
  return NextResponse.json({
    engagements: engagements.map((e) => ({ ...serializeEngagement(e), health: health.get(e.id) })),
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await consultingUser("CREATE");
  if (!user) return error;

  const parsed = engagementBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await assertActiveUser(parsed.data.leadConsultantId))) {
    return NextResponse.json({ error: "Lead consultant must be an active user" }, { status: 400 });
  }

  const engagement = await db.consultingEngagement.create({
    data: {
      ...(engagementData(parsed.data) as object),
      firmName: parsed.data.firmName,
      createdById: user.id,
      stages: initialStages(),
    },
    include: engagementInclude,
  });

  await broadcastConsultingChange(engagement.id);
  return NextResponse.json({ engagement: serializeEngagement(engagement) }, { status: 201 });
}
