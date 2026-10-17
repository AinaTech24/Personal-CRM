import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAttendancePolicy, getHolidayKeys } from "@/lib/attendance-settings";
import { istDateKey, dateFromKey, istMinutesOfDay, isWorkingDay, shiftsOpenForCheckIn, type AttendanceShift } from "@/lib/attendance";

/**
 * Employee self check-in.
 *
 * Blocked on a non-working day (weekly off or a declared holiday) — without
 * this, a check-in on a Sunday or holiday was accepted and silently
 * inflated the attendance percentage, since summarize() only looks at
 * status/approval, never the calendar. Also blocked when the user is on
 * full-day leave (their day is already marked Absent with the leave
 * reason). On half-day leave they may only use a HALF_DAY shift. When
 * shifts are configured, the current IST time must fall inside one the
 * user is entitled to.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = istDateKey();
  const date = dateFromKey(key);
  const now = new Date();

  const policy = await getAttendancePolicy();
  const holidayKeys = await getHolidayKeys();
  if (!isWorkingDay(key, policy, holidayKeys)) {
    return NextResponse.json({ error: "Today isn't a working day — check-in isn't available." }, { status: 403 });
  }

  const leave = await db.userLeave.findUnique({ where: { userId_date: { userId: user.id, date } } });
  if (leave?.type === "FULL_DAY") {
    return NextResponse.json(
      { error: `You're on leave today${leave.reason ? ` — ${leave.reason}` : ""}. Check-in isn't available.` },
      { status: 403 }
    );
  }

  if (policy.shifts.length > 0) {
    const allowed: AttendanceShift["type"][] = leave?.type === "HALF_DAY" ? ["HALF_DAY"] : ["FULL_DAY", "HALF_DAY"];
    const open = shiftsOpenForCheckIn(policy.shifts, allowed, istMinutesOfDay(now));
    if (open.length === 0) {
      const windows = policy.shifts
        .filter((s) => allowed.includes(s.type))
        .map((s) => `${s.name} ${s.checkInStart}–${s.checkInEnd}`)
        .join(", ");
      return NextResponse.json(
        {
          error:
            leave?.type === "HALF_DAY"
              ? `You're on half-day leave — check in during a half-day shift (${windows || "none configured"}).`
              : `Check-in is closed right now. Open windows: ${windows || "none configured"}.`,
        },
        { status: 403 }
      );
    }
  }

  const existing = await db.attendance.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });

  if (existing?.checkIn) {
    return NextResponse.json({ error: "You've already checked in today" }, { status: 409 });
  }

  try {
    const record = existing
      ? await db.attendance.update({ where: { id: existing.id }, data: { checkIn: now } })
      : await db.attendance.create({ data: { userId: user.id, date, checkIn: now } });
    return NextResponse.json({ record });
  } catch (err) {
    // Two check-ins landing at the same instant can both pass the
    // `existing` check above before either write lands — the loser hits
    // the userId_date unique constraint rather than a real server error.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "You've already checked in today" }, { status: 409 });
    }
    throw err;
  }
}
