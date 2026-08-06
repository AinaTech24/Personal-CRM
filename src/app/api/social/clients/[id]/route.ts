import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, isSocialMediaLead, logSocialClientActivity, broadcastSocialChange } from "@/lib/social-media";
import { notifyAndPush } from "@/lib/notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const client = await db.socialClient.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      platformAccounts: {
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
      },
      _count: { select: { contentItems: true, adCampaigns: true, monthlyReports: true } },
    },
  });

  return NextResponse.json({ client });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyName: z.string().max(200).optional().nullable(),
  contactPerson: z.string().max(120).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  stage: z.enum(["ENQUIRY", "CALLING", "MEETING", "PLAN_DISCUSSION", "APPROVAL", "ONBOARDED"]).optional(),
  planNotes: z.string().max(5000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const stageChanged = data.stage !== undefined && data.stage !== access.stage;

  const client = await db.socialClient.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.companyName !== undefined && { companyName: data.companyName || null }),
      ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson || null }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.stage !== undefined && { stage: data.stage }),
      ...(data.stage === "APPROVAL" && !access.approvedAt && { approvedAt: new Date() }),
      ...(data.stage === "ONBOARDED" && !access.onboardedAt && { onboardedAt: new Date() }),
      ...(data.planNotes !== undefined && { planNotes: data.planNotes || null }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId || null }),
    },
  });

  if (stageChanged) {
    await logSocialClientActivity(id, user.id, "stage_changed", { from: access.stage, to: data.stage });
  }

  if (data.assignedToId !== undefined && data.assignedToId !== access.assignedToId && data.assignedToId && data.assignedToId !== user.id) {
    await notifyAndPush(
      data.assignedToId,
      "social_client_assigned",
      { clientId: id, clientName: client.name, actorName: user.name },
      { title: "Client assigned", body: `${user.name} assigned you the client "${client.name}"`, url: `/social-media/${id}`, tag: "social-client-assigned" }
    );
  }

  await broadcastSocialChange("social_client_updated", { clientId: id });

  return NextResponse.json({ client });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deletion is a lead/admin action — a regular member managing their own
  // client shouldn't be able to erase the whole record (and everything
  // under it, via cascade) on their own.
  if (!isSocialMediaLead(user, membership)) {
    return NextResponse.json({ error: "Only a Social Media lead or admin can delete a client" }, { status: 403 });
  }

  await db.socialClient.delete({ where: { id } });
  await broadcastSocialChange("social_client_deleted", { clientId: id });

  return NextResponse.json({ ok: true });
}
