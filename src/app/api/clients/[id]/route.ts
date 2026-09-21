import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessClientsModule, isAdmin, isAnalystOnly } from "@/lib/permissions";
import { broadcastClientChange, canDeleteClient, getClientForUser } from "@/lib/clients";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessClientsModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const access = await getClientForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const client = await db.client.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      projects: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ client });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "LOST"]).optional(),
  notes: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  projectIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessClientsModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const access = await getClientForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // getClientForUser widens visibility for Analysts (read-only) — block the
  // write explicitly rather than let that widened read access double as edit access.
  if (isAnalystOnly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;

  const client = await db.client.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.company !== undefined && { company: data.company }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
      // Only an admin may reassign a client's department, same restriction
      // the leads/projects PATCH routes apply for the same reason: clearing
      // it to null (or moving it) would make the record visible/editable
      // company-wide via the departmentId-null fallback.
      ...(data.departmentId !== undefined && isAdmin(user) && { departmentId: data.departmentId }),
      ...(data.projectIds !== undefined && { projects: { set: data.projectIds.map((pid) => ({ id: pid })) } }),
    },
  });

  broadcastClientChange("client_updated", client);

  return NextResponse.json({ client });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessClientsModule(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const access = await getClientForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDeleteClient(user, access)) {
    return NextResponse.json({ error: "Only the creator or an admin can delete this client" }, { status: 403 });
  }

  await db.client.delete({ where: { id } });
  broadcastClientChange("client_deleted", access);

  return NextResponse.json({ ok: true });
}
