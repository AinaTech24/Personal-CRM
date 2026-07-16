import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getLeadForUser } from "@/lib/leads";

const bodySchema = z.object({
  dueAt: z.string().datetime().or(z.string().min(1)),
  note: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getLeadForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }

  const reminder = await db.leadReminder.create({
    data: { leadId: id, dueAt, note: parsed.data.note || null, createdById: user.id },
  });

  await db.leadActivity.create({
    data: { leadId: id, actorId: user.id, action: "reminder_added" },
  });

  return NextResponse.json({ reminder }, { status: 201 });
}
