import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { broadcastProjectChange, getProjectForUser, logProjectActivity } from "@/lib/projects";

/** A day's work, in minutes. Capped at 24h — anything above is a typo, not a shift. */
const MAX_MINUTES_PER_ENTRY = 24 * 60;

const bodySchema = z.object({
  userId: z.string().min(1),
  /** `YYYY-MM-DD`. Date-only on purpose: entries are reported per day. */
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  minutes: z.number().int().positive().max(MAX_MINUTES_PER_ENTRY),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await db.projectTimeEntry.findMany({
    where: { projectId: id },
    include: {
      user: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id, "UPDATE");
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Midnight UTC: the column is a DATE, and building the Date from local parts
  // would store the previous day for anyone west of UTC.
  const workDate = new Date(`${parsed.data.workDate}T00:00:00Z`);
  if (workDate.getTime() > Date.now() + 86_400_000) {
    return NextResponse.json({ error: "Can't log time against a future date" }, { status: 400 });
  }

  const entry = await db.projectTimeEntry.create({
    data: {
      projectId: id,
      userId: parsed.data.userId,
      workDate,
      minutes: parsed.data.minutes,
      description: parsed.data.description || null,
      createdById: user.id,
    },
    include: {
      user: { select: { id: true, name: true, surname: true, avatarDataUrl: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  await logProjectActivity(id, user.id, "time_logged", {
    userId: parsed.data.userId,
    name: entry.user.name,
    minutes: parsed.data.minutes,
    workDate: parsed.data.workDate,
  });

  broadcastProjectChange("project_updated", access, access.members.map((m) => m.userId));

  return NextResponse.json({ entry }, { status: 201 });
}
