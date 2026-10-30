import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { broadcastProjectChange, canDeleteProject, logProjectActivity, projectListWhere } from "@/lib/projects";
import { notifyAndPush } from "@/lib/notify";
import { resolveTeamScope } from "@/lib/team-scope";
import { moduleAccessScope, isModuleBlocked } from "@/lib/module-permissions-store";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "PROJECTS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // The Social Media / CRM Team console's Projects tab explicitly asks for
  // the team-only view (scope=social-media|crm) — narrower than an Admin's
  // normal company-wide list.
  const { teamOnly, teamUserIds } = await resolveTeamScope(user, req.nextUrl.searchParams.get("scope"));
  if (teamOnly && !teamUserIds) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = await moduleAccessScope(user, "PROJECTS", "READ");

  const projects = await db.project.findMany({
    where: projectListWhere(user, teamUserIds, teamOnly, scope),
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      assignees: { select: { id: true, name: true } },
      _count: { select: { members: true, milestones: true, tasks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ projects });
}

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  /** The full assignee list — may be empty. `assignedToId` (singular, legacy) is derived from its first entry. */
  assigneeIds: z.array(z.string()).optional().default([]),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "PROJECTS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const assigneeIds = [...new Set(data.assigneeIds)];
  // Every assignee is always a member of the project.
  const memberIds = Array.from(new Set([user.id, ...assigneeIds, ...data.memberIds]));

  const project = await db.project.create({
    data: {
      name: data.name,
      description: data.description || null,
      departmentId,
      status: data.status,
      assignedToId: assigneeIds[0] ?? null,
      assignees: { connect: assigneeIds.map((id) => ({ id })) },
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      createdById: user.id,
      members: { create: memberIds.map((userId) => ({ userId, role: userId === user.id ? "owner" : "member" })) },
    },
  });

  await logProjectActivity(project.id, user.id, "created");
  broadcastProjectChange("project_created", project, memberIds);

  await Promise.all(
    assigneeIds
      .filter((id) => id !== user.id)
      .map((id) =>
        notifyAndPush(
          id,
          "project_assigned",
          { projectId: project.id, projectName: project.name, actorName: user.name },
          { title: "Project assigned", body: `${user.name} assigned you the project "${project.name}"`, url: `/projects/${project.id}`, tag: "project-assigned" }
        )
      )
  );

  return NextResponse.json({ project }, { status: 201 });
}

const bulkReassignSchema = z.object({ ids: z.array(z.string()).min(1), assignedToId: z.string().min(1) });

/** Bulk-reassign a set of projects — same per-project "can edit this" rule as the single-project PATCH (creator, member, or a grant), not a blanket admin-only action. */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "PROJECTS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bulkReassignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const target = await db.user.findUnique({ where: { id: parsed.data.assignedToId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const projectsScope = await moduleAccessScope(user, "PROJECTS", "UPDATE");
  const projects = await db.project.findMany({
    where: { id: { in: parsed.data.ids }, deletedAt: null },
    include: { members: { select: { userId: true } } },
  });
  // Authorization is strictly about the ACTOR's own relationship to each
  // project — it must never include the target's membership. The target
  // being a member says nothing about whether the caller may edit the
  // project; checking it here would let anyone reassign a project they
  // have no relationship to, as long as they pick an assignee who already
  // happens to be on it.
  const editable = projects.filter(
    (p) =>
      isAdmin(user) ||
      projectsScope === "all" ||
      (projectsScope !== null && p.departmentId === projectsScope.departmentId) ||
      p.createdById === user.id ||
      p.members.some((m) => m.userId === user.id)
  );

  for (const project of editable) {
    await db.project.update({
      where: { id: project.id },
      data: { assignedToId: target.id, assignees: { set: [{ id: target.id }] } },
    });
    // Same reasoning as the single-project PATCH: a new assignee needs
    // membership too, or they can't open what they were just assigned.
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: target.id } },
      create: { projectId: project.id, userId: target.id, role: "member" },
      update: {},
    });
    await logProjectActivity(project.id, user.id, "reassigned", { assignedToId: target.id });
    broadcastProjectChange(
      "project_updated",
      project,
      [...new Set(project.members.map((m) => m.userId).concat(target.id))]
    );
  }
  if (editable.length > 0) {
    if (target.id !== user.id) {
      await notifyAndPush(
        target.id,
        "project_assigned",
        { projectId: editable[0].id, projectName: editable[0].name, actorName: user.name },
        {
          title: "Projects assigned",
          body: `${user.name} assigned you ${editable.length} project${editable.length === 1 ? "" : "s"}`,
          url: "/projects",
          tag: "project-assigned",
        }
      );
    }
  }

  return NextResponse.json({ updated: editable.length, skipped: parsed.data.ids.length - editable.length });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

/** Soft delete — moves every deletable project to Trash rather than removing it. */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "PROJECTS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const projects = await db.project.findMany({
    where: { id: { in: parsed.data.ids }, deletedAt: null },
    include: { members: { select: { userId: true } } },
  });
  const deletableFlags = await Promise.all(projects.map((p) => canDeleteProject(user, p)));
  const deletable = projects.filter((_p, i) => deletableFlags[i]);

  if (deletable.length > 0) {
    await db.project.updateMany({
      where: { id: { in: deletable.map((p) => p.id) } },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
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
