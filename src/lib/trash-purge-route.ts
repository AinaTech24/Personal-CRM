import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { purgeExpiredFor } from "@/lib/trash";
import type { TrashModuleKey } from "@/lib/trash-types";

/**
 * Builds the POST handler every `.../purge-trash/route.ts` file re-exports —
 * permanently deletes whatever's sat in that module's Trash past the 30-day
 * retention window (see TRASH_RETENTION_DAYS, trash-types.ts). Same two ways
 * in as the other reminder/cron routes: an admin trigger for testing, or a
 * scheduler hitting this with the CRON_SECRET header for the real schedule —
 * each route still needs its own cron entry once deployed, same as the
 * send-reminders routes; only the handler body is now shared.
 */
export function createPurgeTrashRoute(module: TrashModuleKey) {
  return async function POST(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = req.headers.get("x-cron-secret");
    const viaCron = !!cronSecret && providedSecret === cronSecret;

    if (!viaCron) {
      const user = await getCurrentUser();
      if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const purged = await purgeExpiredFor(module);
    return NextResponse.json({ purged });
  };
}
