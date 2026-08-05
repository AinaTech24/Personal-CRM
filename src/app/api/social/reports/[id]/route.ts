import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialReportForUser, logSocialClientActivity } from "@/lib/social-media";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialReportForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const report = await db.socialMonthlyReport.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
      files: { include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({ report });
}

const patchSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  description: z.string().max(3000).optional().nullable(),
  reach: z.number().int().nonnegative().optional().nullable(),
  engagement: z.number().int().nonnegative().optional().nullable(),
  followersGained: z.number().int().optional().nullable(),
  bestPosts: z.string().max(2000).optional().nullable(),
  adSpend: z.number().nonnegative().optional().nullable(),
  adLeads: z.number().int().nonnegative().optional().nullable(),
  adCost: z.number().nonnegative().optional().nullable(),
  adCtr: z.number().nonnegative().optional().nullable(),
  adConversions: z.number().int().nonnegative().optional().nullable(),
  insights: z.string().max(3000).optional().nullable(),
  retargetingSuggestions: z.string().max(3000).optional().nullable(),
  nextMonthPlan: z.string().max(3000).optional().nullable(),
  reviewed: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialReportForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { reviewed, ...rest } = parsed.data;

  const report = await db.socialMonthlyReport.update({
    where: { id },
    data: {
      ...rest,
      ...(reviewed !== undefined && { reviewedAt: reviewed ? new Date() : null }),
      updatedById: user.id,
    },
  });

  await logSocialClientActivity(access.clientId, user.id, "monthly_report_updated", { year: access.year, month: access.month });

  return NextResponse.json({ report });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialReportForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.socialMonthlyReport.delete({ where: { id } });
  await logSocialClientActivity(access.clientId, user.id, "monthly_report_deleted", { year: access.year, month: access.month });

  return NextResponse.json({ ok: true });
}
