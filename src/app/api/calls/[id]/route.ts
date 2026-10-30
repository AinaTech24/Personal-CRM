import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageCall, canDeleteCall, broadcastCallChange } from "@/lib/calls";
import { combinedTeamScopeFor } from "@/lib/team-scope";
import { canManageModule } from "@/lib/module-permissions-store";

const callInclude = {
  lead: { select: { id: true, name: true, company: true } },
  owner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

const patchSchema = z.object({
  leadId: z.string().nullable().optional(),
  clientName: z.string().max(200).nullable().optional(),
  callType: z.enum(["INCOMING", "OUTGOING", "MISSED"]).optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable().optional(),
  ownerId: z.string().optional(),
  nextAction: z.string().max(2000).nullable().optional(),
  subject: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const call = await db.call.findUnique({ where: { id }, include: callInclude });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [teamUserIds, hasGrant] = await Promise.all([combinedTeamScopeFor(user), canManageModule(user, "CALLS", "READ")]);
  if (!canManageCall(user, call, teamUserIds, hasGrant)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ call });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await db.call.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [teamUserIds, hasGrant] = await Promise.all([combinedTeamScopeFor(user), canManageModule(user, "CALLS", "UPDATE")]);
  if (!canManageCall(user, existing, teamUserIds, hasGrant)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const startTime = d.startTime !== undefined ? new Date(d.startTime) : existing.startTime;
  if (Number.isNaN(startTime.getTime())) return NextResponse.json({ error: "Invalid start time" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (d.leadId !== undefined) data.leadId = d.leadId || null;
  if (d.clientName !== undefined) data.clientName = d.clientName?.trim() || null;
  if (d.callType !== undefined) data.callType = d.callType;
  if (d.startTime !== undefined) data.startTime = startTime;
  if (d.endTime !== undefined) {
    const endTime = d.endTime ? new Date(d.endTime) : null;
    if (endTime && (Number.isNaN(endTime.getTime()) || endTime < startTime)) {
      return NextResponse.json({ error: "End time must be after the start time" }, { status: 400 });
    }
    data.endTime = endTime;
  }
  if (d.ownerId !== undefined) data.ownerId = d.ownerId;
  if (d.nextAction !== undefined) data.nextAction = d.nextAction?.trim() || null;
  if (d.subject !== undefined) data.subject = d.subject?.trim() || null;
  if (d.description !== undefined) data.description = d.description?.trim() || null;

  const call = await db.call.update({ where: { id }, data, include: callInclude });
  broadcastCallChange("call_updated", call);

  return NextResponse.json({ call });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await db.call.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [teamUserIds, hasGrant] = await Promise.all([combinedTeamScopeFor(user), canManageModule(user, "CALLS", "DELETE")]);
  if (!canDeleteCall(user, existing, teamUserIds, hasGrant)) {
    return NextResponse.json({ error: "Only the creator, a CRM lead, or an admin can delete this call" }, { status: 403 });
  }

  await db.call.delete({ where: { id } });
  broadcastCallChange("call_deleted", existing);

  return NextResponse.json({ ok: true });
}
