import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { dateFromKey, keyFromDate } from "@/lib/attendance";
import { grantLeaveDay, leaveWorkingDays, revokeLeaveDay } from "@/lib/leave";
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
 * Approve / reject (admins) or cancel (the requester) a pending request — a
 * decision is final, so two admins can't overwrite each other and approving
 * can't apply the same days twice. "edit" is separate: admins can edit any
 * request regardless of status, and editing an approved one re-syncs its
 * attendance stamp to the new dates.
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

  const canManageLeave = isAdmin(user) || (await canManageModule(user, "LEAVE"));

  if (action === "edit") {
    if (!canManageLeave) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // An approved request already stamped attendance for its original dates —
    // clear that stamp and re-apply it for the edited dates/type so the two
    // never quietly disagree. Revoking everything first (rather than diffing)
    // also covers a full-day leave shrinking to half-day on the same date.
    if (request.status === "APPROVED") {
      const oldDays = await leaveWorkingDays(keyFromDate(request.startDate), keyFromDate(request.endDate));
      for (const key of oldDays) {
        await revokeLeaveDay(request.userId, key);
      }
      const reason = `${CATEGORY_LABEL[d.category]} leave: ${d.reason}`.slice(0, 300);
      for (const key of workingDays) {
        await grantLeaveDay({
          userId: request.userId,
          dateKey: key,
          type: d.isHalfDay ? "HALF_DAY" : "FULL_DAY",
          reason,
          actorId: user.id,
        });
      }
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
    if (!canManageLeave) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

/** Admin only. An approved request's attendance stamp is undone first, so nothing is left stuck marked as leave. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(await canManageModule(user, "LEAVE")))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const request = await db.leaveRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (request.status === "APPROVED") {
    const days = await leaveWorkingDays(keyFromDate(request.startDate), keyFromDate(request.endDate));
    for (const key of days) {
      await revokeLeaveDay(request.userId, key);
    }
  }

  await db.leaveRequest.delete({ where: { id } });
  emitToAdmins("leave_request_changed", { id });
  return NextResponse.json({ ok: true });
}
