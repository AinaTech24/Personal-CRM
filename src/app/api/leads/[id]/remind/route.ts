import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadForUser } from "@/lib/leads";
import { notifyAndPush } from "@/lib/notify";

/**
 * An on-demand nudge to a lead's assignee (falling back to its creator when
 * unassigned) to follow up — for anyone who can already see this lead (its
 * creator/assignee, an admin, a Leads module grant, or a Social Media lead
 * covering it).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lead = await getLeadForUser(user, id, "UPDATE");
  if (lead === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recipientId = lead.assignedToId ?? lead.createdById;
  if (recipientId === user.id) {
    return NextResponse.json({ error: "This lead isn't assigned to anyone else to remind." }, { status: 400 });
  }

  await notifyAndPush(
    recipientId,
    "lead_reminder",
    { leadId: lead.id, leadName: lead.name, actorName: user.name },
    { title: "Lead reminder", body: `${user.name} sent a reminder about the lead "${lead.name}"`, url: "/leads", tag: "lead-reminder" }
  );

  return NextResponse.json({ ok: true });
}
