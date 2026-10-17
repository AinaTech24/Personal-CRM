import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/attendance";
import { LIFECYCLE_STAGES } from "@/lib/consulting";
import {
  assertActiveUser,
  broadcastConsultingChange,
  consultingUser,
  serializeStage,
  stagePatchSchema,
} from "@/lib/consulting-store";

type Params = { params: Promise<{ id: string; stage: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("UPDATE");
  if (!user) return error;

  const { id, stage: stageParam } = await params;
  const stage = Number(stageParam);
  if (!Number.isInteger(stage) || !LIFECYCLE_STAGES.some((s) => s.stage === stage)) {
    return NextResponse.json({ error: "Unknown stage" }, { status: 404 });
  }

  const parsed = stagePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;
  if (!(await assertActiveUser(d.ownerId))) return NextResponse.json({ error: "Owner must be an active user" }, { status: 400 });

  const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? dateFromKey(v) : null);
  const data = {
    ...(d.status !== undefined && { status: d.status }),
    ...(d.ownerId !== undefined && { ownerId: d.ownerId }),
    ...(d.plannedStart !== undefined && { plannedStart: toDate(d.plannedStart) }),
    ...(d.plannedEnd !== undefined && { plannedEnd: toDate(d.plannedEnd) }),
    ...(d.actualEnd !== undefined && { actualEnd: toDate(d.actualEnd) }),
    ...(d.percentComplete !== undefined && { percentComplete: d.percentComplete }),
    ...(d.notes !== undefined && { notes: d.notes }),
    // Marking a stage done without saying how far along it is reads as 100%.
    ...(d.status === "DONE" && d.percentComplete === undefined && { percentComplete: 100 }),
  };

  // Stages are created with the engagement, but upsert keeps an engagement
  // that somehow predates a stage (or lost one) working rather than 404ing.
  const engagement = await db.consultingEngagement.findUnique({ where: { id }, select: { id: true } });
  if (!engagement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.consultingStage.upsert({
    where: { engagementId_stage: { engagementId: id, stage } },
    create: { engagementId: id, stage, ...data },
    update: data,
    include: { owner: { select: { id: true, name: true, surname: true } } },
  });

  // Touch the engagement so "recently updated" ordering reflects stage work.
  await db.consultingEngagement.update({ where: { id }, data: { updatedAt: new Date() } });
  await broadcastConsultingChange(id);
  return NextResponse.json({ stage: serializeStage(updated) });
}
