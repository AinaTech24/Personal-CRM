import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getSocialMembership, getSocialMediaTeamUserIds, isSocialMediaLead } from "@/lib/social-media";

/**
 * A Social Media lead's own version of /api/audit-logs (admin-only, every
 * actor) — same underlying AuditLog, filtered to just the Social Media
 * team's own actorIds so a lead sees what their team did across the whole
 * CRM without seeing any other department's activity.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getSocialMembership(user.id);
  if (!isSocialMediaLead(user, membership) || isAdmin(user)) {
    // Company admins already have the unrestricted /api/audit-logs; this
    // route exists only for a non-admin Social Media lead.
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
