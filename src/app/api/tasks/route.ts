import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastTaskChange, canDeleteTask, taskListWhere } from "@/lib/tasks";
import { notifyAndPush } from "@/lib/notify";
import { resolveTeamScope } from "@/lib/team-scope";
import { moduleAccessScope, isModuleBlocked } from "@/lib/module-permissions-store";
import { parsePageParams } from "@/lib/pagination";
import { parseFilterParam, UNASSIGNED } from "@/lib/filter-utils";

/**
 * Every filter the board's own facets (assignee/status/priority) and
 * free-text search apply — moved server-side, alongside `take`/`skip`
 * pagination, so neither breaks the other: a search for something not yet
 * loaded still finds it, and loading more doesn't have to re-filter an
 * ever-growing in-memory list.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "TASKS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;

  // The Social Media / CRM Team console's Tasks tab explicitly asks for the
  // team-only view (scope=social-media|crm) — narrower than an Admin's
  // normal company-wide list.
  const { teamOnly, teamUserIds } = await resolveTeamScope(user, params.get("scope"));
  if (teamOnly && !teamUserIds) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = await moduleAccessScope(user, "TASKS", "READ");

  const and: object[] = [taskListWhere(user, teamUserIds, teamOnly, scope)];

  const assigneeFilter = parseFilterParam(params.get("assignee"));
  if (assigneeFilter) {
    const or: object[] = [];
    const ids = assigneeFilter.filter((v) => v !== UNASSIGNED);
    if (ids.length > 0) or.push({ assignedToId: { in: ids } }, { assignees: { some: { id: { in: ids } } } });
    if (assigneeFilter.includes(UNASSIGNED)) or.push({ AND: [{ assignedToId: null }, { assignees: { none: {} } }] });
    and.push({ OR: or });
  }
  const statusFilter = parseFilterParam(params.get("status"));
  if (statusFilter) and.push({ status: { in: statusFilter } });
  const priorityFilter = parseFilterParam(params.get("priority"));
  if (priorityFilter) and.push({ priority: { in: priorityFilter } });

  const q = params.get("q")?.trim();
  if (q) {
    and.push({ OR: [{ title: { contains: q } }, { description: { contains: q } }] });
  }

  const where = { AND: and };
  const { take, skip } = parsePageParams(params, { defaultTake: 50, maxTake: 200 });

  const [tasks, total] = await Promise.all([
    db.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: { updatedAt: "desc" },
      take,
      skip,
    }),
    db.task.count({ where }),
  ]);

  return NextResponse.json({ tasks, total, hasMore: skip + tasks.length < total });
}

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"]).default("TODO"),
  dueDate: z.string().optional().nullable(),
  /** The full assignee list — may be empty. `assignedToId` (singular, legacy) is derived from its first entry rather than read from the client, so there's only ever one source of truth for who's assigned. */
  assigneeIds: z.array(z.string()).optional().default([]),
  remindAt: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "TASKS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;
  const assigneeIds = [...new Set(data.assigneeIds)];

  const task = await db.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      status: data.status,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assignedToId: assigneeIds[0] ?? null,
      assignees: { connect: assigneeIds.map((id) => ({ id })) },
      createdById: user.id,
      remindAt: data.remindAt ? new Date(data.remindAt) : null,
    },
    include: { assignees: { select: { id: true } } },
  });

  await Promise.all(
    assigneeIds
      .filter((id) => id !== user.id)
      .map((id) =>
        notifyAndPush(
          id,
          "task_assigned",
          { taskId: task.id, taskTitle: task.title, actorName: user.name },
          { title: "Task assigned", body: `${user.name} assigned you the task "${task.title}"`, url: "/tasks", tag: "task-assigned" }
        )
      )
  );

  broadcastTaskChange("task_created", task);

  return NextResponse.json({ task }, { status: 201 });
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) });

/** Soft delete — moves every deletable task to Trash rather than removing it. */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "TASKS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const tasks = await db.task.findMany({
    where: { id: { in: parsed.data.ids }, deletedAt: null },
    include: {
      createdBy: { select: { departmentId: true } },
      assignedTo: { select: { departmentId: true } },
      assignees: { select: { id: true, departmentId: true } },
    },
  });
  const deletableFlags = await Promise.all(tasks.map((t) => canDeleteTask(user, t)));
  const deletable = tasks.filter((_t, i) => deletableFlags[i]);

  if (deletable.length > 0) {
    await db.task.updateMany({
      where: { id: { in: deletable.map((t) => t.id) } },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
    for (const task of deletable) broadcastTaskChange("task_deleted", task);
  }

  const skipped = parsed.data.ids.length - deletable.length;
  return NextResponse.json({ deleted: deletable.length, skipped });
}
