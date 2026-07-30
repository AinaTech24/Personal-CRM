import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

/** Admin-only: who's on the Social Media team. Granting access is an admin action, not a member one. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await db.socialMediaMember.findMany({
    include: { user: { select: { id: true, name: true, surname: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ members });
}

const bodySchema = z.object({
  userId: z.string().min(1),
  isLead: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const target = await db.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const member = await db.socialMediaMember.upsert({
    where: { userId: parsed.data.userId },
    create: { userId: parsed.data.userId, isLead: parsed.data.isLead ?? false },
    update: { isLead: parsed.data.isLead ?? false },
    include: { user: { select: { id: true, name: true, surname: true, email: true } } },
  });

  return NextResponse.json({ member }, { status: 201 });
}
