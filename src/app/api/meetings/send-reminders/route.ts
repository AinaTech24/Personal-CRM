import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { notifyUser } from "@/lib/notify";
import { sendPushToUsers } from "@/lib/push";

/**
 * Fires every Meeting whose remindAt has passed and hasn't been sent yet —
 * both an in-app toast/bell (notifyUser) and a real OS-level push
 * (sendPushToUsers), to the organizer and every attendee. Same two ways in
 * as the attendance reminder route: an admin trigger for testing, or a
 * scheduler with the CRON_SECRET header for the real schedule — point a
 * cron (Render Cron, or crontab on the VPS) at this every few minutes.
 *
 * Idempotent via a persisted reminderSentAt rather than the in-memory
 * rate-limit.ts trick attendance reminders use — that trick suits a
 * condition re-derived fresh every run (today's shift state); a one-time
 * "remind me at this instant" is simpler to just mark done on the row
 * itself, and it survives a restart, which the in-memory map wouldn't.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const due = await db.meeting.findMany({
    where: { remindAt: { lte: new Date() }, reminderSentAt: null, status: { not: "CANCELLED" }, deletedAt: null },
    select: { id: true, title: true, organizerId: true, attendees: { select: { id: true } } },
  });

  let sent = 0;

  for (const meeting of due) {
    const recipientIds = Array.from(new Set([meeting.organizerId, ...meeting.attendees.map((a) => a.id)]));
    let notifiedAny = false;

    for (const userId of recipientIds) {
      // notifyUser returns null when the recipient has the "meetings" category
      // turned off in Settings — push should be muted right along with it,
      // not fire unconditionally alongside it.
      const notification = await notifyUser(userId, "meeting_reminder", { meetingId: meeting.id, meetingTitle: meeting.title });
      if (notification) {
        await sendPushToUsers([userId], {
          title: "Meeting reminder",
          body: `"${meeting.title}" is coming up.`,
          url: "/meetings",
          tag: "meeting-reminder",
        });
        notifiedAny = true;
      }
    }

    // Marked sent regardless of whether anyone actually had it turned on —
    // otherwise a fully-muted meeting would be re-checked (and re-skipped)
    // by every future cron run forever instead of once.
    await db.meeting.update({ where: { id: meeting.id }, data: { reminderSentAt: new Date() } });
    if (notifiedAny) sent += 1;
  }

  return NextResponse.json({ checked: due.length, sent });
}
