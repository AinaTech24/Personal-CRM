import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  dueDate: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  status: z.enum(["PENDING", "WORKING", "DONE"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, milestoneId } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data = parsed.data;
  // A milestone is "completed" when its status is DONE (or the legacy `completed` flag is set).
  const nextStatus = data.status ?? (data.completed === true ? "DONE" : data.completed === false ? "PENDING" : undefined);

  const milestone = await db.milestone.update({
    where: { id: milestoneId, projectId: id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      ...(nextStatus !== undefined && {
        status: nextStatus,
        completedAt: nextStatus === "DONE" ? new Date() : null,
      }),
    },
  });

  if (nextStatus === "DONE") {
    await logProjectActivity(id, user.id, "milestone_completed", { title: milestone.title });
  }

  return NextResponse.json({ milestone });
}
