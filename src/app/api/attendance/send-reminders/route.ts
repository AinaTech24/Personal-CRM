import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { istDateKey, dateFromKey, istMinutesOfDay, type AttendanceShift } from "@/lib/attendance";
import { computeReminders, computeLunchReminders, type ReminderUserState } from "@/lib/attendance-reminders";
import { notifyUser } from "@/lib/notify";
import { sendPushToUsers } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Fixed 9:30 AM check-in / 6:00-6:30 PM check-out reminder windows (ending
 * at checkInEnd/checkOutEnd below). Deliberately NOT read from the
 * admin-configured AttendanceSettings shifts: those same shift windows also
 * gate whether check-in/out is allowed at all (see the check-in/check-out
 * routes) — reusing them here would silently turn a "don't forget" nudge
 * into a hard cutoff for anyone relying on configured shifts. This list only
 * ever feeds the reminder computation below, never enforcement.
 */
const REMINDER_WINDOWS: AttendanceShift[] = [
  { name: "Standard", type: "FULL_DAY", checkInStart: "00:00", checkInEnd: "09:30", checkOutStart: "00:00", checkOutEnd: "18:30" },
  { name: "Standard", type: "HALF_DAY", checkInStart: "00:00", checkInEnd: "09:30", checkOutStart: "00:00", checkOutEnd: "18:30" },
];

// Check-in should nudge right at 9:30, not from 9:00 onward — a much
// shorter lead than checkout's. Kept at least as long as the sweep interval
// below (10 min) so a run always lands inside it; any shorter risks missing
// the day's only window entirely.
const CHECK_IN_LEAD_MINUTES = 10;

/**
 * Sends a check-in or check-out nudge to anyone within their lead window
 * (CHECK_IN_LEAD_MINUTES / REMINDER_LEAD_MINUTES) of REMINDER_WINDOWS
 * closing who hasn't acted yet — both an in-app toast/bell notification
 * (notifyUser) and a real OS-level push notification (sendPushToUsers), so
 * it reaches a closed app on a phone or desktop, not just a tab that's
 * already open.
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

  const dateKey = istDateKey();
  const date = dateFromKey(dateKey);
  const nowMinutes = istMinutesOfDay();

  const [users, leaves, attendance] = await Promise.all([
    db.user.findMany({ where: { isActive: true }, select: { id: true } }),
    db.userLeave.findMany({ where: { date }, select: { userId: true, type: true } }),
    db.attendance.findMany({ where: { date }, select: { userId: true, checkIn: true, checkOut: true, breakIn: true } }),
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

  const candidates = computeReminders(REMINDER_WINDOWS, states, nowMinutes, { checkInLeadMinutes: CHECK_IN_LEAD_MINUTES });
  const lunchCandidates = computeLunchReminders(
    users.map((u) => {
      const a = attendanceByUser.get(u.id);
      return { userId: u.id, checkedIn: !!a?.checkIn, checkedOut: !!a?.checkOut, onBreak: !!a?.breakIn };
    }),
    nowMinutes
  );

  let checkIn = 0;
  let checkOut = 0;
  let lunch = 0;

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

  await Promise.all(
    lunchCandidates.map(async (userId) => {
      const key = `attendance-reminder:lunch_break_reminder:${userId}:${dateKey}`;
      if (!rateLimit(key, 1, 20 * 60 * 60 * 1000).allowed) return;

      const notification = await notifyUser(userId, "lunch_break_reminder", {});
      if (!notification) return;

      await sendPushToUsers([userId], {
        title: "Lunch break",
        body: "It's almost 1:00 — don't forget to log your lunch break.",
        url: "/attendance",
        tag: "attendance-reminder",
      });
      lunch += 1;
    })
  );

  return NextResponse.json({ sent: checkIn + checkOut + lunch, checkIn, checkOut, lunch });
}
