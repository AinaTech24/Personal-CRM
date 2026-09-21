import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessClientsModule, isAdmin } from "@/lib/permissions";
import { broadcastClientChange, canDeleteClient, clientListWhere } from "@/lib/clients";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessClientsModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clients = await db.client.findMany({
    where: clientListWhere(user),
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      projects: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ clients });
}

const bodySchema = z.object({
  name: z.string().min(1),
  company: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "LOST"]).default("ACTIVE"),
  notes: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  projectIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessClientsModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;
  const departmentId = isAdmin(user) ? data.departmentId || null : user.departmentId;

  const client = await db.client.create({
    data: {
      name: data.name,
      company: data.company || null,
      email: data.email || null,
      phone: data.phone || null,
      status: data.status,
      notes: data.notes || null,
      departmentId,
      assignedToId: data.assignedToId || null,
      createdById: user.id,
      projects: data.projectIds.length ? { connect: data.projectIds.map((id) => ({ id })) } : undefined,
    },
  });

  broadcastClientChange("client_created", client);

  return NextResponse.json({ client }, { status: 201 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessClientsModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const clients = await db.client.findMany({ where: { id: { in: parsed.data.ids } } });
  const deletable = clients.filter((c) => canDeleteClient(user, c));

  if (deletable.length > 0) {
    await db.client.deleteMany({ where: { id: { in: deletable.map((c) => c.id) } } });
    for (const client of deletable) broadcastClientChange("client_deleted", client);
  }

  const skipped = parsed.data.ids.length - deletable.length;
  return NextResponse.json({ deleted: deletable.length, skipped });
}
