import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastLeadChange, canDeleteLead, getLeadForUser } from "@/lib/leads";
import { getSocialMembership, isSocialMediaOnlyUser, logSocialClientActivity, broadcastSocialChange } from "@/lib/social-media";
import { notifyUser } from "@/lib/notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getLeadForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      reminders: { orderBy: { dueAt: "asc" } },
      activities: {
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({ lead });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum([
    "NEW",
    "CONTACTED",
    "MEETING",
    "QUALIFIED",
    "PROPOSAL_SENT",
    "NEGOTIATION",
    "WON",
    "LOST",
  ]).optional(),
  leadArriveDate: z.string().nullable().optional(),
  meetingDate: z.string().nullable().optional(),
  meetingStatus: z.enum(["SCHEDULED", "DUE", "COMPLETED"]).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getLeadForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;
  const before = access;

  const lead = await db.lead.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.company !== undefined && { company: data.company }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.product !== undefined && { product: data.product }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.leadArriveDate !== undefined && {
        leadArriveDate: data.leadArriveDate ? new Date(data.leadArriveDate) : null,
      }),
      ...(data.meetingDate !== undefined && {
        meetingDate: data.meetingDate ? new Date(data.meetingDate) : null,
      }),
      ...(data.meetingStatus !== undefined && { meetingStatus: data.meetingStatus }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
      ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
    },
  });

  if (data.status && data.status !== before.status) {
    await db.leadActivity.create({
      data: {
        leadId: id,
        actorId: user.id,
        action: "status_changed",
        meta: { from: before.status, to: data.status },
      },
    });
  }

  if (data.assignedToId !== undefined && data.assignedToId !== before.assignedToId) {
    await db.leadActivity.create({
      data: {
        leadId: id,
        actorId: user.id,
        action: "assigned",
        meta: { assignedToId: data.assignedToId },
      },
    });
    if (data.assignedToId && data.assignedToId !== user.id) {
      await notifyUser(data.assignedToId, "lead_assigned", { leadId: id, leadName: lead.name, actorName: user.name });
    }
  }

  // A Social Media team member moving their own lead to "Approval" (WON,
  // their pipeline's label for it) auto-creates the matching Social Media
  // client — nobody outside that team ever sees "Approval" as an option, so
  // this can't fire for an unrelated sales lead. `convertedToClientId` makes
  // it idempotent: re-saving WON (or saving other fields afterward) never
  // creates a second client.
  let convertedClientId: string | null = null;
  if (data.status === "WON" && before.status !== "WON" && !before.convertedToClientId) {
    const membership = await getSocialMembership(user.id);
    if (isSocialMediaOnlyUser(user, membership)) {
      const client = await db.socialClient.create({
        data: {
          name: lead.name,
          companyName: lead.company,
          contactPerson: lead.name,
          phone: lead.phone,
          email: lead.email,
          stage: "APPROVAL",
          assignedToId: lead.assignedToId,
          createdById: user.id,
          planNotes: `Auto-converted from lead "${lead.name}" on approval.`,
        },
      });
      await db.lead.update({ where: { id }, data: { convertedToClientId: client.id } });
      await logSocialClientActivity(client.id, user.id, "created_from_lead", { leadId: id });
      await broadcastSocialChange("social_client_created", { clientId: client.id });
      convertedClientId = client.id;
    }
  }

  broadcastLeadChange("lead_updated", lead);
  if (before.assignedToId && before.assignedToId !== lead.assignedToId) {
    broadcastLeadChange("lead_updated", { ...lead, assignedToId: before.assignedToId, departmentId: before.departmentId });
  }

  return NextResponse.json({ lead: convertedClientId ? { ...lead, convertedToClientId: convertedClientId } : lead, convertedClientId });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getLeadForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDeleteLead(user, access)) {
    return NextResponse.json({ error: "Only the creator or an admin can delete this lead" }, { status: 403 });
  }

  await db.lead.delete({ where: { id } });
  broadcastLeadChange("lead_deleted", access);

  return NextResponse.json({ ok: true });
}
