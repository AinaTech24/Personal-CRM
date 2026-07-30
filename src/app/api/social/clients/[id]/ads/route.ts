import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, logSocialClientActivity } from "@/lib/social-media";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ads = await db.socialAdCampaign.findMany({ where: { clientId: id }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ ads });
}

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  objective: z.enum(["LEADS", "REACH", "FOLLOWERS"]),
  budget: z.number().nonnegative().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  targetAudience: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const ad = await db.socialAdCampaign.create({
    data: {
      clientId: id,
      name: data.name,
      objective: data.objective,
      budget: data.budget ?? null,
      durationDays: data.durationDays ?? null,
      targetAudience: data.targetAudience || null,
      location: data.location || null,
      createdById: user.id,
    },
  });

  await logSocialClientActivity(id, user.id, "ad_campaign_created", { adId: ad.id, name: data.name });

  return NextResponse.json({ ad }, { status: 201 });
}
