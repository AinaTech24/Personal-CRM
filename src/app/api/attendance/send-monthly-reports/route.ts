import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { sendMonthlyReports } from "@/lib/attendance-report";

const bodySchema = z
  .object({
    // Optional explicit month; defaults to the previous calendar month.
    year: z.number().int().min(2000).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
  })
  .nullable();

/**
 * Emails every active user their monthly attendance snapshot.
 *
 * Two ways in: an admin triggers it from the UI (session cookie), or a scheduler
 * calls it with the CRON_SECRET header for automatic month-end delivery. The
 * secret path exists because a single-process app has no built-in scheduler —
 * point a cron (Render Cron, or crontab on the VPS) at this once a month.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  const body = parsed.success ? parsed.data : null;

  const result = await sendMonthlyReports(body?.year, body?.month != null ? body.month - 1 : undefined);
  return NextResponse.json(result);
}
