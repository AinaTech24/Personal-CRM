import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, logSocialClientActivity } from "@/lib/social-media";
import { stagesFor } from "@/lib/social-content-workflow";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const content = await db.socialContentItem.findMany({
    where: { clientId: id },
    include: {
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ content });
}

const bodySchema = z.object({
  type: z.enum(["STATIC_POST", "CAROUSEL", "AI_REEL", "REAL_PERSON_REEL"]),
  title: z.string().min(1).max(200),
  caption: z.string().max(3000).optional().nullable(),
  hashtags: z.string().max(500).optional().nullable(),
  platforms: z.array(z.enum(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "TWITTER", "YOUTUBE"])).min(1),
  scheduledFor: z.string().optional().nullable(),
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

  const content = await db.socialContentItem.create({
    data: {
      clientId: id,
      type: data.type,
      title: data.title,
      caption: data.caption || null,
      hashtags: data.hashtags || null,
      stage: stagesFor(data.type)[0],
      platforms: data.platforms.join(","),
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await logSocialClientActivity(id, user.id, "content_created", { contentId: content.id, type: data.type, title: data.title });

  return NextResponse.json({ content }, { status: 201 });
}
