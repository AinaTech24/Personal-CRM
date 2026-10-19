import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getCrmMembership, getCrmTeamUserIds, isCrmLead } from "@/lib/crm-team";

/**
 * The CRM Team console's own version of /api/audit-logs (admin-only, every
 * actor) — same underlying AuditLog, filtered to just the CRM team's own
 * actorIds. Mirrors /api/social/team-activity.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getCrmMembership(user.id);
  if (!isAdmin(user) && !isCrmLead(user, membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prefer the caller's own department when they're a genuine lead (not an
  // admin peeking in) — see getTeamUserIdsBySlug's comment for why this
  // matters with 2+ leads.
  const teamUserIds = await getCrmTeamUserIds(membership?.isLead ? user.departmentId : undefined);
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
    console.error("[crm/team-activity] failed to load:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load activity" }, { status: 500 });
  }
}
