import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * A user's own activity — everything the central Prisma-extension logger
 * (src/lib/db.ts) recorded with them as the actor, across every module.
 * Unlike /api/audit-logs (admin-only, every actor), this is scoped to the
 * caller so a regular user gets a personal history without seeing anyone
 * else's records.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const model = req.nextUrl.searchParams.get("model");

  const logs = await db.auditLog.findMany({
    where: { actorId: user.id, ...(model ? { model } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const models = [...new Set(logs.map((l) => l.model))].sort();

  return NextResponse.json({ logs, models });
}
