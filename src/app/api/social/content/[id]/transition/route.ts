import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialContentForUser, logSocialClientActivity } from "@/lib/social-media";
import { isValidTransition } from "@/lib/social-content-workflow";

const bodySchema = z.object({
  toStage: z.enum([
    "DRAFT",
    "APPROVED_TO_PROCEED",
    "CLIENT_CLIPS_RECEIVED",
    "IN_PRODUCTION",
    "SHARED_FOR_REVIEW",
    "APPROVED_FINAL",
    "PUBLISHED",
    "CANCELLED",
  ]),
  comment: z.string().max(2000).optional().nullable(),
});

/**
 * Moves a content item to its next workflow stage — the only way its stage
 * ever changes (PATCH on the base route deliberately excludes it). Rejects
 * anything other than the single valid next step for this content type, or
 * a cancellation, per src/lib/social-content-workflow.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialContentForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { toStage, comment } = parsed.data;

  if (!isValidTransition(access.type, access.stage, toStage)) {
    return NextResponse.json({ error: `Can't move from ${access.stage} to ${toStage}` }, { status: 400 });
  }

  const [content] = await db.$transaction([
    db.socialContentItem.update({
      where: { id },
      data: {
        stage: toStage,
        ...(toStage === "PUBLISHED" && { publishedAt: new Date() }),
      },
    }),
    db.socialContentApproval.create({
      data: { contentId: id, actorId: user.id, fromStage: access.stage, toStage, comment: comment || null },
    }),
  ]);

  await logSocialClientActivity(access.clientId, user.id, "content_stage_changed", {
    contentId: id,
    title: access.title,
    from: access.stage,
    to: toStage,
  });

  return NextResponse.json({ content });
}
