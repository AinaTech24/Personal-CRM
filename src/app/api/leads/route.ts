import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { broadcastLeadChange, canDeleteLead, leadListWhere } from "@/lib/leads";
import { notifyAndPush } from "@/lib/notify";
import { socialMediaTeamScopeFor } from "@/lib/social-media";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamUserIds = await socialMediaTeamScopeFor(user);
  const leads = await db.lead.findMany({
    where: leadListWhere(user, teamUserIds),
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      _count: { select: { notes: true, reminders: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ leads });
}

const bodySchema = z.object({
  name: z.string().min(1),
  company: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  product: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  leadArriveDate: z.string().optional().nullable(),
  meetingDate: z.string().optional().nullable(),
  meetingStatus: z.enum(["SCHEDULED", "DUE", "COMPLETED"]).optional().nullable(),
  departmentId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;
  const departmentId = isAdmin(user) ? data.departmentId || null : user.departmentId;

  const lead = await db.lead.create({
    data: {
      name: data.name,
      company: data.company || null,
      email: data.email || null,
      phone: data.phone || null,
      source: data.source || null,
      product: data.product || null,
      priority: data.priority,
      leadArriveDate: data.leadArriveDate ? new Date(data.leadArriveDate) : null,
      meetingDate: data.meetingDate ? new Date(data.meetingDate) : null,
      meetingStatus: data.meetingStatus || null,
      departmentId,
      assignedToId: data.assignedToId || null,
      createdById: user.id,
    },
  });

  await db.leadActivity.create({
    data: { leadId: lead.id, actorId: user.id, action: "created" },
  });

  if (data.assignedToId && data.assignedToId !== user.id) {
    await notifyAndPush(
      data.assignedToId,
      "lead_assigned",
      { leadId: lead.id, leadName: lead.name, actorName: user.name },
      { title: "Lead assigned", body: `${user.name} assigned you the lead "${lead.name}"`, url: "/leads", tag: "lead-assigned" }
    );
  }

  broadcastLeadChange("lead_created", lead);

  return NextResponse.json({ lead }, { status: 201 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const leads = await db.lead.findMany({ where: { id: { in: parsed.data.ids } } });
  const deletableFlags = await Promise.all(leads.map((l) => canDeleteLead(user, l)));
  const deletable = leads.filter((_l, i) => deletableFlags[i]);

  if (deletable.length > 0) {
    await db.lead.deleteMany({ where: { id: { in: deletable.map((l) => l.id) } } });
    for (const lead of deletable) broadcastLeadChange("lead_deleted", lead);
  }

  const skipped = parsed.data.ids.length - deletable.length;
  return NextResponse.json({ deleted: deletable.length, skipped });
}
