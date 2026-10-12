import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { dateFromKey, keyFromDate } from "@/lib/attendance";
import { grantLeaveDay, leaveWorkingDays } from "@/lib/leave";
import { leaveRequestInclude, serializeLeaveRequest } from "@/lib/leave-requests";
import { notifyAndPush } from "@/lib/notify";
import { emitToAdmins } from "@/lib/socket-emit";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "cancel", "edit"]),
  adminNote: z.string().trim().max(1000).optional().nullable(),
  // Only used by "edit" — same shape as applying for leave in the first place.
  category: z.enum(["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"]).optional(),
  startDate: dateKey.optional(),
  endDate: dateKey.optional(),
  isHalfDay: z.boolean().optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
});

const CATEGORY_LABEL: Record<string, string> = { CASUAL: "Casual", SICK: "Sick", EARNED: "Earned", UNPAID: "Unpaid", OTHER: "Other" };

/**
 * Approve / reject (admins) or cancel (the requester). Only a pending request
 * can be acted on: a decision is final, so two admins can't overwrite each
 * other, and approving can't apply the same days twice.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { action, adminNote } = parsed.data;

  const { id } = await params;
  const request = await db.leaveRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "edit") {
    if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // An approved request already wrote UserLeave/Attendance rows for its
    // original dates — editing it here wouldn't undo or redo that grant, so
    // the record and the attendance it produced would quietly disagree.
    if (request.status === "APPROVED") {
      return NextResponse.json({ error: "An approved request can't be edited — reject it first if it needs to change." }, { status: 400 });
    }
    const d = parsed.data;
    if (!d.category || !d.startDate || !d.endDate || !d.reason) {
      return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
    }
    if (Number.isNaN(dateFromKey(d.startDate).getTime()) || Number.isNaN(dateFromKey(d.endDate).getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    if (d.endDate < d.startDate) return NextResponse.json({ error: "End date can't be before the start date." }, { status: 400 });
    if (d.isHalfDay && d.startDate !== d.endDate) {
      return NextResponse.json({ error: "A half day must be a single date." }, { status: 400 });
    }
    const workingDays = await leaveWorkingDays(d.startDate, d.endDate);
    if (workingDays.length === 0) {
      return NextResponse.json({ error: "That range has no working days (Sundays and holidays don't count)." }, { status: 400 });
    }
    const updated = await db.leaveRequest.update({
      where: { id },
      data: {
        category: d.category,
        startDate: dateFromKey(d.startDate),
        endDate: dateFromKey(d.endDate),
        isHalfDay: d.isHalfDay ?? false,
        days: d.isHalfDay ? 0.5 : workingDays.length,
        reason: d.reason,
      },
      include: leaveRequestInclude,
    });
    emitToAdmins("leave_request_changed", { id });
    return NextResponse.json({ request: serializeLeaveRequest(updated) });
  }

  if (action === "cancel") {
    if (request.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (request.userId === user.id) {
      return NextResponse.json({ error: "You can't decide your own leave request." }, { status: 403 });
    }
  }

  // Claim the decision atomically: only one caller can move it out of PENDING.
  const status = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "CANCELLED";
  const claimed = await db.leaveRequest.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status,
      decidedById: user.id,
      decidedAt: new Date(),
      adminNote: action === "cancel" ? null : adminNote || null,
    },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This request has already been decided." }, { status: 409 });
  }

  if (action === "approve") {
    const days = await leaveWorkingDays(keyFromDate(request.startDate), keyFromDate(request.endDate));
    const reason = `${CATEGORY_LABEL[request.category]} leave: ${request.reason}`.slice(0, 300);
    for (const key of days) {
      await grantLeaveDay({
        userId: request.userId,
        dateKey: key,
        type: request.isHalfDay ? "HALF_DAY" : "FULL_DAY",
        reason,
        actorId: user.id,
      });
    }
  }

  const updated = await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveRequestInclude });

  if (action !== "cancel") {
    const word = action === "approve" ? "approved" : "rejected";
    await notifyAndPush(
      request.userId,
      "leave_decided",
      { requestId: id, decision: status, actorName: user.name },
      { title: `Leave ${word}`, body: `${user.name} ${word} your leave request`, url: "/leave", tag: "leave-decided" }
    );
  }
  emitToAdmins("leave_request_changed", { id });

  return NextResponse.json({ request: serializeLeaveRequest(updated) });
}

/**
 * Admin only. Same reasoning as "edit" above: an approved request already
 * produced attendance records, so deleting it here would leave those
 * orphaned rather than actually undoing the leave — reject it first instead.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const request = await db.leaveRequest.findUnique({ where: { id }, select: { status: true } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status === "APPROVED") {
    return NextResponse.json({ error: "An approved request can't be deleted — reject it first if it needs to go." }, { status: 400 });
  }

  await db.leaveRequest.delete({ where: { id } });
  emitToAdmins("leave_request_changed", { id });
  return NextResponse.json({ ok: true });
}
