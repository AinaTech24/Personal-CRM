import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { purgeExpiredLeads } from "@/lib/leads";

/**
 * Permanently deletes every lead that's sat in Trash past the 30-day
 * retention window (see TRASH_RETENTION_DAYS, trash-types.ts). Same two ways
 * in as the other reminder/cron routes: an admin trigger for testing, or a
 * scheduler hitting this with the CRON_SECRET header for the real schedule —
 * needs its own cron entry once deployed, same as the send-reminders routes.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const purged = await purgeExpiredLeads();
  return NextResponse.json({ purged });
}
