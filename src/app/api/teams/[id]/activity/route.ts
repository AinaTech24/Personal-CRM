import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getUserTeamMembership, getTeamUserIds } from "@/lib/teams";

/**
 * Any (non-system) team's own version of /api/audit-logs (admin-only, every
 * actor) — same underlying AuditLog, filtered to just this team's own
 * actorIds. Mirrors /api/crm/team-activity and /api/social/team-activity,
 * generalized to an arbitrary team id instead of a fixed slug.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getUserTeamMembership(id, user.id);
  if (!isAdmin(user) && !membership?.isLead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamUserIds = await getTeamUserIds(id, membership?.isLead ? user.departmentId : undefined);
  if (teamUserIds.length === 0) return NextResponse.json({ logs: [], models: [] });

  const model = req.nextUrl.searchParams.get("model");

  try {
    const logs = await db.auditLog.findMany({
      where: { actorId: { in: teamUserIds }, ...(model ? { model } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const models = [...new Set(logs.map((l) => l.model))].sort();

    return NextResponse.json({ logs, models });
  } catch (err) {
    console.error("[teams/activity] failed to load:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load activity" }, { status: 500 });
  }
}
