import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/attendance";
import { parseWorkingWeekdays, workingDayKeys } from "@/lib/leave-calendar";

/** Paid leave days a person gets each calendar year; Unpaid never draws from it. */
export const ANNUAL_LEAVE_ALLOWANCE = 12;

/** Working days the leave covers, from the live attendance settings and holiday list. */
export async function leaveWorkingDays(startKey: string, endKey: string): Promise<string[]> {
  const [settings, holidays] = await Promise.all([
    db.attendanceSettings.findUnique({ where: { id: "default" }, select: { workingWeekdays: true } }),
    db.holiday.findMany({
      where: { date: { gte: dateFromKey(startKey), lte: dateFromKey(endKey) } },
      select: { date: true },
    }),
  ]);
  return workingDayKeys(
    startKey,
    endKey,
    parseWorkingWeekdays(settings?.workingWeekdays),
    new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)))
  );
}

/**
 * Puts a user on leave for one day. Full-day leave also stamps that day's
 * attendance as Absent with the reason, so the record reflects it without any
 * check-in. Shared by the admin "put on leave" route and request approval.
 */
export async function grantLeaveDay(opts: {
  userId: string;
  dateKey: string;
  type: "FULL_DAY" | "HALF_DAY";
  reason: string | null;
  actorId: string;
}) {
  const { userId, dateKey, type, reason, actorId } = opts;
  const date = dateFromKey(dateKey);

  const leave = await db.userLeave.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, type, reason, createdById: actorId },
    update: { type, reason },
    include: { user: { select: { id: true, name: true, surname: true, email: true } } },
  });

  if (type === "FULL_DAY") {
    const note = `On leave${reason ? ` — ${reason}` : ""}`;
    await db.attendance.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        status: "ABSENT",
        calculatedStatus: "ABSENT",
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedById: actorId,
        adminNote: note,
      },
      update: {
        status: "ABSENT",
        statusOverride: true,
        overrideReason: note,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedById: actorId,
        adminNote: note,
      },
    });
  }

  return leave;
}

/**
 * Undoes grantLeaveDay for one day: removes the UserLeave row and, if the
 * attendance row it stamped hasn't been touched since (its override reason
 * still reads "On leave…"), reverts or removes that stamp too. An admin
 * correction made after the leave was granted is left alone — a later manual
 * edit wins over an automatic revert.
 */
export async function revokeLeaveDay(userId: string, dateKey: string) {
  const date = dateFromKey(dateKey);

  await db.userLeave.deleteMany({ where: { userId, date } });

  const attendance = await db.attendance.findUnique({ where: { userId_date: { userId, date } } });
  if (!attendance || !attendance.overrideReason?.startsWith("On leave")) return;

  if (!attendance.checkIn) {
    // The row only exists because leave stamped it — nothing else to preserve.
    await db.attendance.delete({ where: { id: attendance.id } });
    return;
  }

  await db.attendance.update({
    where: { id: attendance.id },
    data: {
      status: attendance.calculatedStatus,
      statusOverride: false,
      overrideReason: null,
      adminNote: null,
      approvalStatus: "PENDING",
      approvedAt: null,
      approvedById: null,
    },
  });
}

export interface LeaveSummary {
  /** Approved days this calendar year, every category. */
  taken: number;
  /** Allowance left after paid (non-Unpaid) approved days. */
  balance: number;
  pending: number;
  rejected: number;
}

/** The dashboard numbers for one person's year. */
export async function leaveSummary(userId: string, year: number): Promise<LeaveSummary> {
  const rows = await db.leaveRequest.findMany({
    where: { userId, startDate: { gte: dateFromKey(`${year}-01-01`), lte: dateFromKey(`${year}-12-31`) } },
    select: { status: true, days: true, category: true },
  });
  let taken = 0;
  let paidTaken = 0;
  let pending = 0;
  let rejected = 0;
  for (const r of rows) {
    if (r.status === "APPROVED") {
      taken += r.days;
      if (r.category !== "UNPAID") paidTaken += r.days;
    } else if (r.status === "PENDING") pending++;
    else if (r.status === "REJECTED") rejected++;
  }
  return { taken, balance: Math.max(0, ANNUAL_LEAVE_ALLOWANCE - paidTaken), pending, rejected };
}
