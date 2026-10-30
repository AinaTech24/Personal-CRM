import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { purgeExpiredTasks } from "@/lib/tasks";

/**
 * Permanently deletes every task that's sat in Trash past the 30-day
 * retention window. Same two ways in as the other reminder/cron routes.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const purged = await purgeExpiredTasks();
  return NextResponse.json({ purged });
}
