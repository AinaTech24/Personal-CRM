import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getTeamDetail, getUserTeamMembership, renameTeam, setTeamDisabled } from "@/lib/teams";

/** A team plus its members — open to a company Admin, or anyone who's a member of it. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isAdmin(user) && !(await getUserTeamMembership(id, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const team = await getTeamDetail(id);
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ team });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  disabled: z.boolean().optional(),
});

/** Rename and/or disable a team — admin-only; a team's own lead manages its members but not the team itself. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.name !== undefined) await renameTeam(id, parsed.data.name);
  if (parsed.data.disabled !== undefined) await setTeamDisabled(id, parsed.data.disabled);

  const team = await getTeamDetail(id);
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ team });
}

/**
 * Deletes a custom team. Refused for a system team (Social Media/CRM — too
 * much else depends on them existing) or one that still has members, same
 * "say what's in the way instead of orphaning or failing deep in the
 * database" reasoning as deleting a Department.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const team = await db.team.findUnique({ where: { id }, select: { isSystem: true, _count: { select: { members: true } } } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (team.isSystem) return NextResponse.json({ error: "This team can't be deleted" }, { status: 409 });
  if (team._count.members > 0) {
    return NextResponse.json({ error: `Still has ${team._count.members} member(s). Remove them first.` }, { status: 409 });
  }

  await db.team.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
