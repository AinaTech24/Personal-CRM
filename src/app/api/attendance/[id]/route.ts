import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requestDevice } from "@/lib/request-info";
import { getAttendancePolicy } from "@/lib/attendance-settings";
import { computeWorkedMinutes, classifyStatus } from "@/lib/attendance";
import { canManageAttendanceFor } from "@/lib/social-media";

const bodySchema = z.object({
  // Times as ISO strings, or null to clear. Editing them re-runs classification.
  checkIn: z.string().datetime().nullable().optional(),
  checkOut: z.string().datetime().nullable().optional(),
  // A manual status override. When it differs from the calculated status, it's recorded as an override.
  status: z.enum(["PRESENT", "HALF_DAY", "ABSENT"]).optional(),
  halfDayReason: z
    .enum(["LATE_ARRIVAL", "EARLY_DEPARTURE", "INSUFFICIENT_HOURS", "APPROVED_HALF_DAY", "MANUAL_ADJUSTMENT", "OTHER"])
    .nullable()
    .optional(),
  overrideReason: z.string().max(500).nullable().optional(),
  adminNote: z.string().max(1000).nullable().optional(),
});

/**
 * Correction / override of one record — a company Admin for anyone, or a
 * Social Media lead for someone on their own team. Editing times recomputes
 * the calculated status; a manual status that differs from the calculation
 * is flagged as an override with `calculatedStatus` preserved as the audit
 * trail. Every change writes an AttendanceAudit row.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const record = await db.attendance.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManageAttendanceFor(actor, record.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const body = parsed.data;

  const data: Prisma.AttendanceUpdateInput = {};
  const audits: { action: string; fromStatus?: typeof record.status; toStatus?: typeof record.status; note?: string }[] = [];
  const { ip, userAgent } = requestDevice(req);

  // 1. Time edits — recompute duration and the calculated status.
  const timesTouched = body.checkIn !== undefined || body.checkOut !== undefined;
  const nextCheckIn = body.checkIn !== undefined ? (body.checkIn ? new Date(body.checkIn) : null) : record.checkIn;
  const nextCheckOut = body.checkOut !== undefined ? (body.checkOut ? new Date(body.checkOut) : null) : record.checkOut;

  let calculatedStatus = record.calculatedStatus;
  if (timesTouched) {
    if (nextCheckIn && nextCheckOut && nextCheckOut <= nextCheckIn) {
      return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    }
    const workedMinutes = computeWorkedMinutes(nextCheckIn, nextCheckOut);
    const policy = await getAttendancePolicy();
    calculatedStatus = workedMinutes == null ? null : classifyStatus(workedMinutes, policy);
    data.checkIn = nextCheckIn;
    data.checkOut = nextCheckOut;
    data.workedMinutes = workedMinutes;
    data.calculatedStatus = calculatedStatus;
    audits.push({ action: "edit_times" });
  }

  // 2. Status: an explicit value that differs from the calculation is an override.
  //    If times changed and no explicit status was given, status follows the new calculation.
  const explicitStatus = body.status;
  const effectiveStatus = explicitStatus ?? (timesTouched ? calculatedStatus : record.status);
  if (effectiveStatus !== record.status || explicitStatus) {
    const isOverride = explicitStatus != null && explicitStatus !== calculatedStatus;
    data.status = effectiveStatus;
    data.statusOverride = isOverride;
    if (isOverride) {
      data.overrideReason = body.overrideReason ?? record.overrideReason ?? null;
    } else {
      data.overrideReason = null;
    }
    if (explicitStatus) {
      audits.push({
        action: "override",
        fromStatus: record.status,
        toStatus: effectiveStatus,
        note: body.overrideReason ?? undefined,
      });
    }
  }

  if (body.halfDayReason !== undefined) data.halfDayReason = body.halfDayReason;
  if (body.adminNote !== undefined) data.adminNote = body.adminNote;
  if (body.overrideReason !== undefined && data.overrideReason === undefined) data.overrideReason = body.overrideReason;

  const updated = await db.attendance.update({ where: { id }, data });

  for (const a of audits) {
    await db.attendanceAudit.create({
      data: {
        attendanceId: id,
        actorId: actor.id,
        action: a.action,
        fromStatus: a.fromStatus ?? null,
        toStatus: a.toStatus ?? null,
        note: a.note ?? null,
        ip,
        userAgent,
      },
    });
  }

  return NextResponse.json({ record: updated });
}
