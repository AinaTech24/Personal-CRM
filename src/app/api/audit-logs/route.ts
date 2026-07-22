import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

/**
 * The activity log. Admins only — it spans every module, so it would otherwise
 * be a way to see records a user has no access to.
 *
 * Capped rather than paginated: this is a "what just happened" view, and the
 * search narrows it. A full history browser would need paging.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const model = req.nextUrl.searchParams.get("model");

  const logs = await db.auditLog.findMany({
    where: model ? { model } : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // The distinct modules present, so the viewer can offer them as a filter
  // without hardcoding a list that would drift from what's actually logged.
  const models = [...new Set(logs.map((l) => l.model))].sort();

  return NextResponse.json({ logs, models });
}
