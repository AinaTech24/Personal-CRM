import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/attendance";
import { parseWorkingWeekdays, workingDayKeys } from "@/lib/leave-calendar";

export interface LeavePolicyData {
  /** Paid leave days allowed per calendar year, pooled across every category except Unpaid. */
  paidYearlyAllowance: number;
  /** Paid leave days allowed in any single calendar month, from that same pool. null = no monthly cap. */
  paidMonthlyAllowance: number | null;
  /** Unpaid leave days allowed per calendar year. null = unlimited. */
  unpaidYearlyAllowance: number | null;
  /** Unpaid leave days allowed in any single calendar month. null = no monthly cap. */
  unpaidMonthlyAllowance: number | null;
}

/** The defaults before an admin has ever saved a policy — 12 paid days/year, nothing else capped, matching this app's behavior before LeavePolicy existed. */
export const DEFAULT_LEAVE_POLICY: LeavePolicyData = {
  paidYearlyAllowance: 12,
  paidMonthlyAllowance: null,
  unpaidYearlyAllowance: null,
  unpaidMonthlyAllowance: null,
};

/** The company-wide leave policy — see /api/leave-policy for who can read/write it. */
export async function getLeavePolicy(): Promise<LeavePolicyData> {
  const row = await db.leavePolicy.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_LEAVE_POLICY;
  return {
    paidYearlyAllowance: row.paidYearlyAllowance,
    paidMonthlyAllowance: row.paidMonthlyAllowance,
    unpaidYearlyAllowance: row.unpaidYearlyAllowance,
    unpaidMonthlyAllowance: row.unpaidMonthlyAllowance,
  };
}

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
  /** Paid yearly allowance left after paid (non-Unpaid) approved days. */
  balance: number;
  pending: number;
  rejected: number;
  /** The policy these numbers were computed against, for display (admin-configurable, see getLeavePolicy). */
  policy: LeavePolicyData;
  paidTakenThisMonth: number;
  paidTakenThisYear: number;
  unpaidTakenThisMonth: number;
  unpaidTakenThisYear: number;
  /** Unpaid allowance left for the year — null when unpaidYearlyAllowance is unlimited. */
  unpaidBalance: number | null;
}

/** The dashboard numbers for one person's year — `month` (1–12) defaults to the current calendar month, for the monthly-cap figures. */
export async function leaveSummary(userId: string, year: number, month?: number): Promise<LeaveSummary> {
  const [policy, rows] = await Promise.all([
    getLeavePolicy(),
    db.leaveRequest.findMany({
      where: { userId, startDate: { gte: dateFromKey(`${year}-01-01`), lte: dateFromKey(`${year}-12-31`) }, deletedAt: null },
      select: { status: true, days: true, category: true, startDate: true },
    }),
  ]);
  const currentMonth = month ?? new Date().getUTCMonth() + 1;
  let taken = 0;
  let paidTakenThisYear = 0;
  let paidTakenThisMonth = 0;
  let unpaidTakenThisYear = 0;
  let unpaidTakenThisMonth = 0;
  let pending = 0;
  let rejected = 0;
  for (const r of rows) {
    if (r.status === "APPROVED") {
      taken += r.days;
      const inMonth = r.startDate.getUTCMonth() + 1 === currentMonth;
      if (r.category !== "UNPAID") {
        paidTakenThisYear += r.days;
        if (inMonth) paidTakenThisMonth += r.days;
      } else {
        unpaidTakenThisYear += r.days;
        if (inMonth) unpaidTakenThisMonth += r.days;
      }
    } else if (r.status === "PENDING") pending++;
    else if (r.status === "REJECTED") rejected++;
  }
  return {
    taken,
    balance: Math.max(0, policy.paidYearlyAllowance - paidTakenThisYear),
    pending,
    rejected,
    policy,
    paidTakenThisMonth,
    paidTakenThisYear,
    unpaidTakenThisMonth,
    unpaidTakenThisYear,
    unpaidBalance: policy.unpaidYearlyAllowance == null ? null : Math.max(0, policy.unpaidYearlyAllowance - unpaidTakenThisYear),
  };
}
