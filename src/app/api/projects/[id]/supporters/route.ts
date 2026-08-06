import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";
import { notifyAndPush } from "@/lib/notify";

const bodySchema = z.object({
  userId: z.string().min(1),
  role: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await db.projectSupporter.findUnique({
    where: { projectId_userId: { projectId: id, userId: parsed.data.userId } },
  });
  if (existing) return NextResponse.json({ error: "Already a supporter" }, { status: 409 });

  const supporter = await db.projectSupporter.create({
    data: {
      projectId: id,
      userId: parsed.data.userId,
      role: parsed.data.role || null,
      notes: parsed.data.notes || null,
    },
    include: { user: { select: { id: true, name: true, surname: true, email: true, avatarDataUrl: true } } },
  });

  await logProjectActivity(id, user.id, "supporter_added", {
    userId: parsed.data.userId,
    name: supporter.user.name,
    role: supporter.role,
  });
  if (parsed.data.userId !== user.id) {
    await notifyAndPush(
      parsed.data.userId,
      "project_supporter_added",
      { projectId: id, projectName: access.name, actorName: user.name },
      { title: "Added as a supporter", body: `${user.name} added you as a supporter on "${access.name}"`, url: `/projects/${id}`, tag: "project-supporter-added" }
    );
  }

  return NextResponse.json({ supporter }, { status: 201 });
}
