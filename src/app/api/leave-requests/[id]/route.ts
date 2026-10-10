import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { keyFromDate } from "@/lib/attendance";
import { grantLeaveDay, leaveWorkingDays } from "@/lib/leave";
import { leaveRequestInclude, serializeLeaveRequest } from "@/lib/leave-requests";
import { notifyAndPush } from "@/lib/notify";
import { emitToAdmins } from "@/lib/socket-emit";

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  adminNote: z.string().trim().max(1000).optional().nullable(),
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
