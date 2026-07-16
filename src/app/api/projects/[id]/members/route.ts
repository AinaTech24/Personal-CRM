import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";
import { notifyUser } from "@/lib/notify";

const bodySchema = z.object({ userId: z.string() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = access.members.find((m) => m.userId === parsed.data.userId);
  if (existing) return NextResponse.json({ error: "Already a member" }, { status: 409 });

  const member = await db.projectMember.create({
    data: { projectId: id, userId: parsed.data.userId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await logProjectActivity(id, user.id, "member_added", { userId: parsed.data.userId });
  if (parsed.data.userId !== user.id) {
    await notifyUser(parsed.data.userId, "project_member_added", { projectId: id, projectName: access.name, actorName: user.name });
  }

  return NextResponse.json({ member }, { status: 201 });
}
