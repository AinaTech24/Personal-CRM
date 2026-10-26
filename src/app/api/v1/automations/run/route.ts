import { NextRequest, NextResponse } from "next/server";
import { isAdminActor } from "@/lib/mfd/access";
import { runScheduledAutomations } from "@/lib/mfd/automations";
import { errorResponse, withActor } from "@/lib/mfd/http";

/**
 * Runs the time-based automations (AUT-05 overdue tasks, AUT-14 month close,
 * AUT-16 renewals) and sweeps the outbox. Same two ways in as the other
 * scheduled routes: a scheduler with the CRON_SECRET header (hourly is
 * plenty), or a Command Centre admin by hand.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) {
    try {
      return NextResponse.json(await runScheduledAutomations());
    } catch (e) {
      return errorResponse(e);
    }
  }
  return withActor(async (actor) => {
    if (!isAdminActor(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(await runScheduledAutomations());
  });
}
