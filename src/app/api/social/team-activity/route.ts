import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getSocialMembership, getSocialMediaTeamUserIds, isSocialMediaLead } from "@/lib/social-media";

/**
 * The Social Media Team console's own version of /api/audit-logs (admin-only,
 * every actor) — same underlying AuditLog, filtered to just the Social Media
 * team's own actorIds. Used both by a non-admin Social Media lead (who has no
 * other way to see this) and by a company Admin/Super Admin viewing the Team
 * console — this tab is specifically the team-scoped view, distinct from the
 * unrestricted /api/audit-logs an admin could otherwise reach.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getSocialMembership(user.id);
  if (!isAdmin(user) && !isSocialMediaLead(user, membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamUserIds = await getSocialMediaTeamUserIds();
  const model = req.nextUrl.searchParams.get("model");

  const logs = await db.auditLog.findMany({
    where: { actorId: { in: teamUserIds }, ...(model ? { model } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const models = [...new Set(logs.map((l) => l.model))].sort();

  return NextResponse.json({ logs, models });
}
