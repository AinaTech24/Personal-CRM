import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { notifyAndPush } from "@/lib/notify";

/** A password that hasn't been changed in this long gets one nag to rotate it. */
const ROTATION_DAYS = 90;

/**
 * Nudges whoever created or last touched a password entry once it's gone
 * this long without being changed — same two ways in as the other reminder
 * routes: an admin trigger for testing, or a scheduler with the CRON_SECRET
 * header for the real schedule.
 *
 * Idempotent via a persisted rotationReminderSentAt, cleared whenever the
 * password value itself is changed (see PATCH /api/passwords/[id]) so
 * going stale again later earns a fresh nag rather than staying silent
 * forever after the first one.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const staleCutoff = new Date(Date.now() - ROTATION_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await db.passwordEntry.findMany({
    where: { updatedAt: { lte: staleCutoff }, rotationReminderSentAt: null },
    select: { id: true, label: true, createdById: true, updatedById: true },
  });

  let sent = 0;

  for (const entry of candidates) {
    const recipientIds = new Set([entry.createdById, ...(entry.updatedById ? [entry.updatedById] : [])]);
    let notifiedAnyone = false;
    for (const userId of recipientIds) {
      const notification = await notifyAndPush(
        userId,
        "password_rotation_due",
        { passwordEntryId: entry.id, label: entry.label },
        {
          title: "Password rotation due",
          body: `"${entry.label}" hasn't been changed in over ${ROTATION_DAYS} days.`,
          url: "/passwords",
          tag: "password-rotation-due",
        }
      );
      if (notification) notifiedAnyone = true;
    }
    if (notifiedAnyone) sent += 1;

    await db.passwordEntry.update({ where: { id: entry.id }, data: { rotationReminderSentAt: new Date() } });
  }

  return NextResponse.json({ checked: candidates.length, sent });
}
