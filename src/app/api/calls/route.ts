import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { callListWhere, broadcastCallChange } from "@/lib/calls";
import { notifyAndPush } from "@/lib/notify";
import { resolveTeamScope } from "@/lib/team-scope";
import { parsePageParams } from "@/lib/pagination";

const callInclude = {
  lead: { select: { id: true, name: true, company: true } },
  owner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

/**
 * List calls the user owns or logged (admins/CRM leads see the whole team).
 * `scope=crm` explicitly asks for the CRM Team console's team-only view —
 * same convention as Leads/Tasks/Meetings/Projects. A naturally fast-growing
 * log, so paginated with `take`/`skip` like the other list endpoints.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const { teamOnly, teamUserIds } = await resolveTeamScope(user, params.get("scope"));
  if (teamOnly && !teamUserIds) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = callListWhere(user, teamUserIds, teamOnly);
  const { take, skip } = parsePageParams(params, { defaultTake: 50, maxTake: 200 });

  const [calls, total] = await Promise.all([
    db.call.findMany({ where, include: callInclude, orderBy: { startTime: "desc" }, take, skip }),
    db.call.count({ where }),
  ]);

  return NextResponse.json({ calls, total, hasMore: skip + calls.length < total });
}

const bodySchema = z.object({
  leadId: z.string().optional().nullable(),
  clientName: z.string().max(200).optional().nullable(),
  callType: z.enum(["INCOMING", "OUTGOING", "MISSED"]),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  ownerId: z.string().min(1),
  nextAction: z.string().max(2000).optional().nullable(),
  subject: z.string().max(200).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const startTime = new Date(d.startTime);
  if (Number.isNaN(startTime.getTime())) return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  let endTime: Date | null = null;
  if (d.endTime) {
    endTime = new Date(d.endTime);
    if (Number.isNaN(endTime.getTime()) || endTime < startTime) {
      return NextResponse.json({ error: "End time must be after the start time" }, { status: 400 });
    }
  }

  const owner = await db.user.findUnique({ where: { id: d.ownerId }, select: { id: true } });
  if (!owner) return NextResponse.json({ error: "Call owner not found" }, { status: 400 });

  const call = await db.call.create({
    data: {
      leadId: d.leadId || null,
      clientName: d.clientName?.trim() || null,
      callType: d.callType,
      startTime,
      endTime,
      ownerId: d.ownerId,
      nextAction: d.nextAction?.trim() || null,
      subject: d.subject?.trim() || null,
      description: d.description?.trim() || null,
      createdById: user.id,
    },
    include: callInclude,
  });

  if (call.ownerId !== user.id) {
    await notifyAndPush(
      call.ownerId,
      "call_assigned",
      { callId: call.id, callSubject: call.subject, actorName: user.name },
      { title: "Call logged", body: `${user.name} logged a call with you as the owner`, url: "/calls", tag: "call-assigned" }
    );
  }

  broadcastCallChange("call_created", call);

  return NextResponse.json({ call }, { status: 201 });
}
