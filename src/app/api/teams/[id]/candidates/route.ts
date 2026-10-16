import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageTeam } from "@/lib/team-permissions";
import { getUserTeamMembership } from "@/lib/teams";

/**
 * A trimmed user picker for "add an existing user to this team" — active
 * users not already a member, deliberately not the full /api/users admin
 * console since a non-admin team lead can reach this. Mirrors
 * /api/social|crm/team-candidates for the generic Teams console.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const actorMembership = await getUserTeamMembership(id, user.id);
  if (!isAdmin(user) && !canManageTeam(user, actorMembership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    where: { isActive: true, teamMemberships: { none: { teamId: id } } },
    select: { id: true, name: true, surname: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
