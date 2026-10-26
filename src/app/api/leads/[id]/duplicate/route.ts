import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { broadcastLeadChange, getLeadForUser } from "@/lib/leads";
import { notifyAndPush } from "@/lib/notify";

/**
 * Duplicates a lead as a new one owned by whoever duplicated it — same
 * contact info, priority, and department as the source, but a fresh NEW
 * status and no meeting/conversion progress carried over (notes, reminders,
 * and activity history aren't copied either; a fresh "created" entry is
 * written instead). Same access as editing the source lead.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getLeadForUser(user, id, "UPDATE");
  if (existing === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const departmentId = isAdmin(user) ? existing.departmentId : user.departmentId;

  const lead = await db.lead.create({
    data: {
      name: `${existing.name} (Copy)`,
      company: existing.company,
      email: existing.email,
      phone: existing.phone,
      source: existing.source,
      product: existing.product,
      priority: existing.priority,
      leadArriveDate: existing.leadArriveDate,
      departmentId,
      assignedToId: existing.assignedToId,
      createdById: user.id,
    },
  });

  await db.leadActivity.create({
    data: { leadId: lead.id, actorId: user.id, action: "created" },
  });

  if (lead.assignedToId && lead.assignedToId !== user.id) {
    await notifyAndPush(
      lead.assignedToId,
      "lead_assigned",
      { leadId: lead.id, leadName: lead.name, actorName: user.name },
      { title: "Lead assigned", body: `${user.name} assigned you the lead "${lead.name}"`, url: "/leads", tag: "lead-assigned" }
    );
  }

  broadcastLeadChange("lead_created", lead);

  return NextResponse.json({ lead }, { status: 201 });
}
