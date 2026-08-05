import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialAdForUser, logSocialClientActivity } from "@/lib/social-media";
import { isValidAdTransition } from "@/lib/social-ad-workflow";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialAdForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ad: access });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  objective: z.enum(["LEADS", "REACH", "FOLLOWERS"]).optional(),
  platforms: z.array(z.enum(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "TWITTER", "YOUTUBE"])).min(1).optional(),
  budget: z.number().nonnegative().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  targetAudience: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  stage: z
    .enum([
      "DISCUSSION",
      "BUDGET_DURATION",
      "TARGETING",
      "CONTENT_APPROVAL",
      "AD_CREATION",
      "GROUP_APPROVAL",
      "CAMPAIGN_SETUP",
      "RUNNING",
      "REPORTING",
      "COMPLETED",
      "CANCELLED",
    ])
    .optional(),
  leadsGenerated: z.number().int().nonnegative().optional().nullable(),
  reach: z.number().int().nonnegative().optional().nullable(),
  cost: z.number().nonnegative().optional().nullable(),
  ctr: z.number().nonnegative().optional().nullable(),
  conversions: z.number().int().nonnegative().optional().nullable(),
  retargetingNotes: z.string().max(3000).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialAdForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const stageChanged = data.stage !== undefined && data.stage !== access.stage;
  if (stageChanged && !isValidAdTransition(access.stage, data.stage!)) {
    return NextResponse.json({ error: `Can't move from ${access.stage} to ${data.stage}` }, { status: 400 });
  }

  const ad = await db.socialAdCampaign.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.objective !== undefined && { objective: data.objective }),
      ...(data.platforms !== undefined && { platforms: data.platforms.join(",") }),
      ...(data.budget !== undefined && { budget: data.budget }),
      ...(data.durationDays !== undefined && { durationDays: data.durationDays }),
      ...(data.targetAudience !== undefined && { targetAudience: data.targetAudience || null }),
      ...(data.location !== undefined && { location: data.location || null }),
      ...(data.stage !== undefined && { stage: data.stage }),
      ...(data.stage === "RUNNING" && !access.startedAt && { startedAt: new Date() }),
      ...((data.stage === "COMPLETED" || data.stage === "CANCELLED") && !access.endedAt && { endedAt: new Date() }),
      ...(data.leadsGenerated !== undefined && { leadsGenerated: data.leadsGenerated }),
      ...(data.reach !== undefined && { reach: data.reach }),
      ...(data.cost !== undefined && { cost: data.cost }),
      ...(data.ctr !== undefined && { ctr: data.ctr }),
      ...(data.conversions !== undefined && { conversions: data.conversions }),
      ...(data.retargetingNotes !== undefined && { retargetingNotes: data.retargetingNotes || null }),
      updatedById: user.id,
    },
  });

  if (stageChanged) {
    await logSocialClientActivity(access.clientId, user.id, "ad_stage_changed", { adId: id, from: access.stage, to: data.stage });
  }
  const fieldsChanged = Object.keys(data).some((k) => k !== "stage");
  if (fieldsChanged) {
    await logSocialClientActivity(access.clientId, user.id, "ad_campaign_updated", { adId: id, name: ad.name });
  }

  return NextResponse.json({ ad });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialAdForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.socialAdCampaign.delete({ where: { id } });
  await logSocialClientActivity(access.clientId, user.id, "ad_campaign_deleted", { adId: id, name: access.name });

  return NextResponse.json({ ok: true });
}
