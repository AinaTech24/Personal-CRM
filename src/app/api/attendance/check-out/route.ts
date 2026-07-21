import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAttendancePolicy } from "@/lib/attendance-settings";
import {
  istDateKey,
  dateFromKey,
  computeWorkedMinutes,
  classifyStatus,
  AUTO_HALF_DAY_REASON,
} from "@/lib/attendance";

/**
 * Employee self check-out — computes duration, auto-classifies against the
 * configured thresholds, and (per policy) either leaves the record PENDING for
 * admin approval or auto-approves it.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = istDateKey();
  const date = dateFromKey(key);
  const now = new Date();

  const record = await db.attendance.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });

  if (!record?.checkIn) return NextResponse.json({ error: "You haven't checked in today" }, { status: 409 });
  if (record.checkOut) return NextResponse.json({ error: "You've already checked out today" }, { status: 409 });

  const policy = await getAttendancePolicy();
  const workedMinutes = computeWorkedMinutes(record.checkIn, now) ?? 0;
  const calculatedStatus = classifyStatus(workedMinutes, policy);
  // A full Present day that was both checked in and out needs no sign-off —
  // it's auto-approved. Half days and absences still follow the approval policy.
  const autoApprove = !policy.requireApproval || calculatedStatus === "PRESENT";

  const updated = await db.attendance.update({
    where: { id: record.id },
    data: {
      checkOut: now,
      workedMinutes,
      calculatedStatus,
      // Not overridden — effective status follows the calculation.
      status: calculatedStatus,
      statusOverride: false,
      halfDayReason: calculatedStatus === "HALF_DAY" ? AUTO_HALF_DAY_REASON : null,
      approvalStatus: autoApprove ? "APPROVED" : "PENDING",
      approvedAt: autoApprove ? now : null,
    },
  });

  return NextResponse.json({ record: updated });
}
