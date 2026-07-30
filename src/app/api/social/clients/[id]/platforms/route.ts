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

  const platforms = await db.socialPlatformAccount.findMany({ where: { clientId: id }, orderBy: { platform: "asc" } });
  return NextResponse.json({ platforms });
}

// Deliberately no password/credential-value field — see SocialPlatformAccount's
// schema comment. This form only ever records a handle and whether login
// details have been collected, never the details themselves.
const bodySchema = z.object({
  platform: z.enum(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "TWITTER", "YOUTUBE"]),
  handle: z.string().max(120).optional().nullable(),
  credentialsReceived: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
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

  const platformAccount = await db.socialPlatformAccount.upsert({
    where: { clientId_platform: { clientId: id, platform: data.platform } },
    create: {
      clientId: id,
      platform: data.platform,
      handle: data.handle || null,
      credentialsReceived: data.credentialsReceived ?? false,
      notes: data.notes || null,
    },
    update: {
      handle: data.handle || null,
      credentialsReceived: data.credentialsReceived ?? false,
      notes: data.notes || null,
    },
  });

  await logSocialClientActivity(id, user.id, "platform_updated", { platform: data.platform });

  return NextResponse.json({ platform: platformAccount }, { status: 201 });
}
