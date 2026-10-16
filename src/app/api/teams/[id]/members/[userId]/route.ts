import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { PermissionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { canManageTeam } from "@/lib/team-permissions";
import { getUserTeamMembership, addTeamMember, removeTeamMember } from "@/lib/teams";

/** Shared guard for both handlers below: signed in, the team exists and isn't a system team, and the caller may manage it (admin, or that team's own lead). */
async function requireTeamManager(id: string): Promise<{ user: PermissionUser } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const team = await db.team.findUnique({ where: { id }, select: { isSystem: true } });
  if (!team) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (team.isSystem) {
    return { error: NextResponse.json({ error: "Manage this team's members from its own page" }, { status: 409 }) };
  }

  const actorMembership = await getUserTeamMembership(id, user.id);
  if (!isAdmin(user) && !canManageTeam(user, actorMembership)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

const patchSchema = z.object({ isLead: z.boolean() });

/** Promotes/demotes a member's lead status. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const checked = await requireTeamManager(id);
  if ("error" in checked) return checked.error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const member = await addTeamMember(id, userId, parsed.data.isLead);
  return NextResponse.json({ member });
}

/** Removes a member from a custom team. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const checked = await requireTeamManager(id);
  if ("error" in checked) return checked.error;

  await removeTeamMember(id, userId);
  return NextResponse.json({ ok: true });
}
