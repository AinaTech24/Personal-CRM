import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, logSocialClientActivity } from "@/lib/social-media";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; platformId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, platformId } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const platform = await db.socialPlatformAccount.findUnique({ where: { id: platformId } });
  if (!platform || platform.clientId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.socialPlatformAccount.delete({ where: { id: platformId } });
  await logSocialClientActivity(id, user.id, "platform_removed", { platform: platform.platform });

  return NextResponse.json({ ok: true });
}
