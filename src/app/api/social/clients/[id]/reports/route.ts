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

  const reports = await db.socialMonthlyReport.findMany({
    where: { clientId: id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return NextResponse.json({ reports });
}

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
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
});

/** One report per client+month — creating an existing one updates it instead (an editable draft-until-reviewed shape). */
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

  const report = await db.socialMonthlyReport.upsert({
    where: { clientId_year_month: { clientId: id, year: data.year, month: data.month } },
    create: { ...data, clientId: id, createdById: user.id },
    update: data,
  });

  await logSocialClientActivity(id, user.id, "monthly_report_saved", { year: data.year, month: data.month });

  return NextResponse.json({ report }, { status: 201 });
}
