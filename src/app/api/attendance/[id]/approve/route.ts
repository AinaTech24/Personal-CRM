import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { requestDevice } from "@/lib/request-info";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional(),
});

/** Admin approves or rejects a record. Approval finalizes it into the summary; rejection excludes it. Both are audited. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || !isAdmin(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { decision, note } = parsed.data;

  const record = await db.attendance.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status === null) {
    return NextResponse.json({ error: "Nothing to approve — this day has no finalized status yet" }, { status: 400 });
  }

  const now = new Date();
  const updated = await db.attendance.update({
    where: { id },
    data: {
      approvalStatus: decision,
      approvedById: actor.id,
      approvedAt: decision === "APPROVED" ? now : null,
      ...(note !== undefined && { adminNote: note }),
    },
  });

  const { ip, userAgent } = requestDevice(req);
  await db.attendanceAudit.create({
    data: {
      attendanceId: id,
      actorId: actor.id,
      action: decision === "APPROVED" ? "approve" : "reject",
      fromStatus: record.status,
      toStatus: record.status,
      note: note ?? null,
      ip,
      userAgent,
    },
  });

  return NextResponse.json({ record: updated });
}
