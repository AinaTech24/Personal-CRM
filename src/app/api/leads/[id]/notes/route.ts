import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getLeadForUser } from "@/lib/leads";

const bodySchema = z.object({ body: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getLeadForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const note = await db.leadNote.create({
    data: { leadId: id, authorId: user.id, body: parsed.data.body },
    include: { author: { select: { name: true } } },
  });

  await db.leadActivity.create({
    data: { leadId: id, actorId: user.id, action: "note_added" },
  });

  return NextResponse.json({ note }, { status: 201 });
}
