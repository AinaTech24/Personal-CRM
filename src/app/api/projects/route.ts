import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { broadcastProjectChange, canDeleteProject, logProjectActivity, projectListWhere } from "@/lib/projects";
import { notifyAndPush } from "@/lib/notify";
import { resolveTeamScope } from "@/lib/team-scope";
import { canManageModule } from "@/lib/module-permissions-store";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The Social Media / CRM Team console's Projects tab explicitly asks for
  // the team-only view (scope=social-media|crm) — narrower than an Admin's
  // normal company-wide list.
  const { teamOnly, teamUserIds } = await resolveTeamScope(user, req.nextUrl.searchParams.get("scope"));
  if (teamOnly && !teamUserIds) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fullAccess = await canManageModule(user, "PROJECTS");

  const projects = await db.project.findMany({
    where: projectListWhere(user, teamUserIds, teamOnly, fullAccess),
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { members: true, milestones: true, tasks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ projects });
}

const bodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  assignedToId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;
  const departmentId = isAdmin(user) ? data.departmentId : user.departmentId;
  if (!departmentId) {
    return NextResponse.json(
      { error: "A department is required to create a project" },
      { status: 400 }
    );
  }

  // The assignee is always a member of the project.
  const memberIds = Array.from(new Set([user.id, ...(data.assignedToId ? [data.assignedToId] : []), ...data.memberIds]));

  const project = await db.project.create({
    data: {
      name: data.name,
      description: data.description || null,
      departmentId,
      status: data.status,
      assignedToId: data.assignedToId || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      createdById: user.id,
      members: { create: memberIds.map((userId) => ({ userId, role: userId === user.id ? "owner" : "member" })) },
    },
  });

  await logProjectActivity(project.id, user.id, "created");
  broadcastProjectChange("project_created", project, memberIds);

  if (data.assignedToId && data.assignedToId !== user.id) {
    await notifyAndPush(
      data.assignedToId,
      "project_assigned",
      { projectId: project.id, projectName: project.name, actorName: user.name },
      { title: "Project assigned", body: `${user.name} assigned you the project "${project.name}"`, url: `/projects/${project.id}`, tag: "project-assigned" }
    );
  }

  return NextResponse.json({ project }, { status: 201 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const projects = await db.project.findMany({
    where: { id: { in: parsed.data.ids } },
    include: { members: { select: { userId: true } } },
  });
  const deletableFlags = await Promise.all(projects.map((p) => canDeleteProject(user, p)));
  const deletable = projects.filter((_p, i) => deletableFlags[i]);

  if (deletable.length > 0) {
    await db.project.deleteMany({ where: { id: { in: deletable.map((p) => p.id) } } });
    for (const project of deletable) {
      broadcastProjectChange(
        "project_deleted",
        project,
        project.members.map((m) => m.userId)
      );
    }
  }

  const skipped = parsed.data.ids.length - deletable.length;
  return NextResponse.json({ deleted: deletable.length, skipped });
}
