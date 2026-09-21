import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isAnalystOnly } from "@/lib/permissions";
import {
  broadcastProjectChange,
  canDeleteProject,
  getProjectForUser,
  logProjectActivity,
} from "@/lib/projects";
import { notifyAndPush } from "@/lib/notify";

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
      supporters: {
        include: { user: { select: { id: true, name: true, surname: true, email: true, avatarDataUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
      timeEntries: {
        include: {
          user: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      },
      milestones: { orderBy: { dueDate: "asc" } },
      tasks: {
        include: {
          assignedTo: { select: { id: true, name: true } },
          assignedBy: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
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
  estimatedHours: z.number().int().min(0).max(100_000).nullable().optional(),
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
  // getProjectForUser widens visibility for Analysts (read-only) — block the
  // write explicitly rather than let that widened read access double as edit access.
  if (isAnalystOnly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
      ...(data.estimatedHours !== undefined && { estimatedHours: data.estimatedHours }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId || null }),
      // Only an admin may reassign a project's department — same restriction
      // the POST route already applies on create. Without this, any user
      // with edit access to a single project could move it to another
      // department, or clear it to `null`, which is treated as visible/
      // editable by everyone in `canAccessDepartmentRecord`.
      ...(data.departmentId !== undefined && isAdmin(user) && { departmentId: data.departmentId }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
    },
  });

  if (data.status && data.status !== before.status) {
    await logProjectActivity(id, user.id, "status_changed", { from: before.status, to: data.status });
  }

  if (data.assignedToId !== undefined && data.assignedToId !== before.assignedToId) {
    if (data.assignedToId && data.assignedToId !== user.id) {
      await notifyAndPush(
        data.assignedToId,
        "project_assigned",
        { projectId: id, projectName: project.name, actorName: user.name },
        { title: "Project assigned", body: `${user.name} assigned you the project "${project.name}"`, url: `/projects/${id}`, tag: "project-assigned" }
      );
    }
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
  if (!(await canDeleteProject(user, access))) {
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
