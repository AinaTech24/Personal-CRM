import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCrmMembership, isCrmLead } from "@/lib/crm-team";
import { listTeamMembersBySlug, upsertTeamMemberBySlug } from "@/lib/teams";

const TEAM_SLUG = "crm";

/** Who's on the CRM team — company admins and the team's own lead can both manage this, not a regular member. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await listTeamMembersBySlug(TEAM_SLUG);

  return NextResponse.json({ members });
}

const bodySchema = z.object({
  userId: z.string().min(1),
  isLead: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const target = await db.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const member = await upsertTeamMemberBySlug(TEAM_SLUG, parsed.data.userId, parsed.data.isLead ?? false);

  return NextResponse.json({ member }, { status: 201 });
}
