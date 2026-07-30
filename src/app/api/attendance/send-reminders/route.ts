import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getAttendancePolicy } from "@/lib/attendance-settings";
import { istDateKey, dateFromKey, istMinutesOfDay } from "@/lib/attendance";
import { computeReminders, type ReminderUserState } from "@/lib/attendance-reminders";
import { notifyUser } from "@/lib/notify";
import { sendPushToUsers } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Sends a check-in or check-out nudge to anyone within REMINDER_LEAD_MINUTES
 * of their shift window closing who hasn't acted yet — both an in-app
 * toast/bell notification (notifyUser) and a real OS-level push notification
 * (sendPushToUsers), so it reaches a closed app on a phone or desktop, not
 * just a tab that's already open.
 *
 * Same two ways in as send-monthly-reports: an admin trigger for testing, or
 * a scheduler with the CRON_SECRET header for the real schedule. This one
 * needs to run every ~15 minutes (well under REMINDER_LEAD_MINUTES) — point
 * a cron (Render Cron, or crontab on the VPS) at it, same as the monthly one.
 *
 * De-duped in memory (rate-limit.ts) per user+shift+kind+day, safe here for
 * the same reason the auth rate limiter is: this app is pinned to a single
 * PM2 fork-mode process, so "in memory" already means "shared across every
 * call." Without it, a cron running every 15 minutes would re-notify the same
 * person 1-2 more times inside the same 30-minute lead window.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const policy = await getAttendancePolicy();
  if (policy.shifts.length === 0) {
    return NextResponse.json({ sent: 0, checkIn: 0, checkOut: 0, reason: "No shifts configured" });
  }

  const dateKey = istDateKey();
  const date = dateFromKey(dateKey);
  const nowMinutes = istMinutesOfDay();

  const [users, leaves, attendance] = await Promise.all([
    db.user.findMany({ where: { isActive: true }, select: { id: true } }),
    db.userLeave.findMany({ where: { date }, select: { userId: true, type: true } }),
    db.attendance.findMany({ where: { date }, select: { userId: true, checkIn: true, checkOut: true } }),
  ]);

  const leaveByUser = new Map(leaves.map((l) => [l.userId, l.type]));
  const attendanceByUser = new Map(attendance.map((a) => [a.userId, a]));

  const states: ReminderUserState[] = users.map((u) => {
    const a = attendanceByUser.get(u.id);
    return {
      userId: u.id,
      leaveType: leaveByUser.get(u.id) ?? null,
      checkedIn: !!a?.checkIn,
      checkedOut: !!a?.checkOut,
    };
  });

  const candidates = computeReminders(policy.shifts, states, nowMinutes);

  let checkIn = 0;
  let checkOut = 0;

  await Promise.all(
    candidates.map(async (c) => {
      // Once per user+shift+kind+day — long enough to cover the rest of
      // today regardless of how often the cron fires, reset by tomorrow's
      // first run since the window itself moves on.
      const key = `attendance-reminder:${c.kind}:${c.shiftName}:${c.userId}:${dateKey}`;
      if (!rateLimit(key, 1, 20 * 60 * 60 * 1000).allowed) return;

      // notifyUser returns null when the user has the "attendance" category
      // turned off in Settings — that preference should mute the OS push too,
      // not just the in-app toast/bell, so push is gated on this result
      // rather than fired unconditionally alongside it.
      const notification = await notifyUser(c.userId, c.kind, { shiftName: c.shiftName });
      if (!notification) return;

      const title = c.kind === "check_in_reminder" ? "Check-in reminder" : "Check-out reminder";
      const body =
        c.kind === "check_in_reminder"
          ? `Don't forget to check in for ${c.shiftName} — the window closes soon.`
          : `Don't forget to check out for ${c.shiftName} — the window closes soon.`;

      await sendPushToUsers([c.userId], { title, body, url: "/attendance", tag: "attendance-reminder" });

      if (c.kind === "check_in_reminder") checkIn += 1;
      else checkOut += 1;
    })
  );

  return NextResponse.json({ sent: checkIn + checkOut, checkIn, checkOut });
}
