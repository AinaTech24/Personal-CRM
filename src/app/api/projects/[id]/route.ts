import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  broadcastProjectChange,
  canDeleteProject,
  getProjectForUser,
  logProjectActivity,
} from "@/lib/projects";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = await db.project.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      milestones: { orderBy: { dueDate: "asc" } },
      tasks: {
        include: {
          assignedTo: { select: { id: true, name: true } },
          dependsOn: { include: { dependsOnTask: { select: { id: true, title: true, status: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
      documents: { include: { uploadedBy: { select: { name: true } } }, omit: { data: true }, orderBy: { createdAt: "desc" } },
      activities: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  return NextResponse.json({ project });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  assignedToId: z.string().nullable().optional(),
  departmentId: z.string().optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;
  const before = access;

  const project = await db.project.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.progress !== undefined && { progress: data.progress }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId || null }),
      ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
    },
  });

  if (data.status && data.status !== before.status) {
    await logProjectActivity(id, user.id, "status_changed", { from: before.status, to: data.status });
  }

  broadcastProjectChange(
    "project_updated",
    project,
    before.members.map((m) => m.userId)
  );

  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDeleteProject(user, access)) {
    return NextResponse.json({ error: "Only the creator or an admin can delete this project" }, { status: 403 });
  }

  await db.project.delete({ where: { id } });
  broadcastProjectChange(
    "project_deleted",
    access,
    access.members.map((m) => m.userId)
  );

  return NextResponse.json({ ok: true });
}
