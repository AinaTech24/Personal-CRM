import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, hasSocialMediaAccess, crmClientsScopeFor, logSocialClientActivity, broadcastSocialChange } from "@/lib/social-media";
import { socialClientListWhere } from "@/lib/social-media-permissions";
import { canManageModule, moduleAccessScope, isModuleBlocked } from "@/lib/module-permissions-store";
import { notifyAndPush } from "@/lib/notify";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "CLIENTS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const membership = await getSocialMembership(user.id);
  const clientsScope = (await moduleAccessScope(user, "CLIENTS", "READ")) ?? (await crmClientsScopeFor(user));
  if (!hasSocialMediaAccess(user, membership) && clientsScope === null) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clients = await db.socialClient.findMany({
    where: socialClientListWhere(user, membership, clientsScope),
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { contentItems: true, adCampaigns: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ clients });
}

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  companyName: z.string().max(200).optional().nullable(),
  contactPerson: z.string().max(120).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  planNotes: z.string().max(5000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "CLIENTS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const membership = await getSocialMembership(user.id);
  if (!hasSocialMediaAccess(user, membership) && !(await canManageModule(user, "CLIENTS", "CREATE"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const client = await db.socialClient.create({
    data: {
      name: data.name,
      companyName: data.companyName || null,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      planNotes: data.planNotes || null,
      assignedToId: data.assignedToId || null,
      createdById: user.id,
    },
  });

  await logSocialClientActivity(client.id, user.id, "created");

  if (data.assignedToId && data.assignedToId !== user.id) {
    await notifyAndPush(
      data.assignedToId,
      "social_client_assigned",
      { clientId: client.id, clientName: client.name, actorName: user.name },
      { title: "Client assigned", body: `${user.name} assigned you the client "${client.name}"`, url: `/social-media/${client.id}`, tag: "social-client-assigned" }
    );
  }

  await broadcastSocialChange("social_client_created", { clientId: client.id });

  return NextResponse.json({ client }, { status: 201 });
}
