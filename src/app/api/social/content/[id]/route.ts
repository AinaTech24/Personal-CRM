import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialContentForUser, isSocialMediaLead, logSocialClientActivity } from "@/lib/social-media";
import { canManageModule } from "@/lib/module-permissions-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialContentForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const content = await db.socialContentItem.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
      approvals: { include: { actor: { select: { id: true, name: true } } }, orderBy: { decidedAt: "asc" } },
    },
  });

  return NextResponse.json({ content });
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  caption: z.string().max(3000).optional().nullable(),
  hashtags: z.string().max(500).optional().nullable(),
  platforms: z.array(z.enum(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "TWITTER", "YOUTUBE"])).min(1).optional(),
  scheduledFor: z.string().optional().nullable(),
});

/** Content field edits, not stage moves — see /transition for the workflow-validated stage change. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialContentForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const content = await db.socialContentItem.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.caption !== undefined && { caption: data.caption || null }),
      ...(data.hashtags !== undefined && { hashtags: data.hashtags || null }),
      ...(data.platforms !== undefined && { platforms: data.platforms.join(",") }),
      ...(data.scheduledFor !== undefined && { scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null }),
      updatedById: user.id,
    },
  });

  await logSocialClientActivity(access.clientId, user.id, "content_updated", { contentId: id, title: content.title });

  return NextResponse.json({ content });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialContentForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deletion is a lead/admin action, same as deleting the parent client —
  // a regular member assigned to the client shouldn't be able to erase its
  // content on their own.
  if (!isSocialMediaLead(user, membership) && !(await canManageModule(user, "CLIENTS", "DELETE"))) {
    return NextResponse.json({ error: "Only a Social Media lead or admin can delete content" }, { status: 403 });
  }

  await db.socialContentItem.delete({ where: { id } });
  await logSocialClientActivity(access.clientId, user.id, "content_deleted", { contentId: id, title: access.title });

  return NextResponse.json({ ok: true });
}
