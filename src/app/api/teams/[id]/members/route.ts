import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageTeam } from "@/lib/team-permissions";
import { addTeamMember, getUserTeamMembership } from "@/lib/teams";

const bodySchema = z.object({ userId: z.string().min(1), isLead: z.boolean().optional() });

/** Adds an existing user to a custom team — admin, or that team's own lead. Social Media/CRM keep managing membership through their own console. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const team = await db.team.findUnique({ where: { id }, select: { isSystem: true } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (team.isSystem) return NextResponse.json({ error: "Manage this team's members from its own page" }, { status: 409 });

  const actorMembership = await getUserTeamMembership(id, user.id);
  if (!isAdmin(user) && !canManageTeam(user, actorMembership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const member = await addTeamMember(id, parsed.data.userId, parsed.data.isLead ?? false);
  return NextResponse.json({ member }, { status: 201 });
}
