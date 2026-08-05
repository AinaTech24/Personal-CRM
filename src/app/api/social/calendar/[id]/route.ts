import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, broadcastSocialChange } from "@/lib/social-media";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const slot = await db.socialContentCalendarSlot.findUnique({ where: { id } });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, slot.clientId);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.socialContentCalendarSlot.delete({ where: { id } });
  await broadcastSocialChange("social_calendar_updated", { clientId: slot.clientId });

  return NextResponse.json({ ok: true });
}
