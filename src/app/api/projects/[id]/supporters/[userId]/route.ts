import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";

const patchSchema = z.object({
  role: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, userId } = await params;
  const access = await getProjectForUser(user, id, "UPDATE");
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await db.projectSupporter.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
  });
  if (!existing) return NextResponse.json({ error: "Not a supporter" }, { status: 404 });

  const supporter = await db.projectSupporter.update({
    where: { projectId_userId: { projectId: id, userId } },
    data: {
      ...(parsed.data.role !== undefined && { role: parsed.data.role || null }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes || null }),
    },
    include: { user: { select: { id: true, name: true, surname: true, email: true, avatarDataUrl: true } } },
  });

  return NextResponse.json({ supporter });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, userId } = await params;
  const access = await getProjectForUser(user, id, "UPDATE");
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await db.projectSupporter.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    include: { user: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not a supporter" }, { status: 404 });

  await db.projectSupporter.delete({ where: { projectId_userId: { projectId: id, userId } } });
  await logProjectActivity(id, user.id, "supporter_removed", { userId, name: existing.user.name });

  // Their logged time stays: removing someone from the supporter list is not a
  // statement that the hours they put in never happened.
  return NextResponse.json({ ok: true });
}
