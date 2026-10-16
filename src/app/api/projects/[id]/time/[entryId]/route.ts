import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { broadcastProjectChange, getProjectForUser, logProjectActivity } from "@/lib/projects";

const MAX_MINUTES_PER_ENTRY = 24 * 60;

const patchSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minutes: z.number().int().positive().max(MAX_MINUTES_PER_ENTRY).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

/**
 * An entry can be changed by the person whose time it records, whoever logged
 * it, the project's creator, or an admin. Anyone else on the project can see
 * the hours but not rewrite someone else's record of their own work.
 */
function canEditEntry(
  user: { id: string; role: string },
  entry: { userId: string; createdById: string },
  project: { createdById: string }
) {
  return (
    isAdmin(user as Parameters<typeof isAdmin>[0]) ||
    entry.userId === user.id ||
    entry.createdById === user.id ||
    project.createdById === user.id
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, entryId } = await params;
  const access = await getProjectForUser(user, id, "UPDATE");
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await db.projectTimeEntry.findUnique({ where: { id: entryId } });
  if (!existing || existing.projectId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditEntry(user, existing, access)) {
    return NextResponse.json({ error: "You can only edit your own time entries" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const entry = await db.projectTimeEntry.update({
    where: { id: entryId },
    data: {
      ...(parsed.data.workDate !== undefined && { workDate: new Date(`${parsed.data.workDate}T00:00:00Z`) }),
      ...(parsed.data.minutes !== undefined && { minutes: parsed.data.minutes }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description || null }),
    },
    include: {
      user: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  broadcastProjectChange("project_updated", access, access.members.map((m) => m.userId));
  return NextResponse.json({ entry });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, entryId } = await params;
  const access = await getProjectForUser(user, id, "UPDATE");
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await db.projectTimeEntry.findUnique({
    where: { id: entryId },
    include: { user: { select: { name: true } } },
  });
  if (!existing || existing.projectId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditEntry(user, existing, access)) {
    return NextResponse.json({ error: "You can only delete your own time entries" }, { status: 403 });
  }

  await db.projectTimeEntry.delete({ where: { id: entryId } });
  await logProjectActivity(id, user.id, "time_removed", {
    name: existing.user.name,
    minutes: existing.minutes,
  });

  broadcastProjectChange("project_updated", access, access.members.map((m) => m.userId));
  return NextResponse.json({ ok: true });
}
