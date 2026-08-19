import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCrmMembership, isCrmLead } from "@/lib/crm-team";

const patchSchema = z.object({ isLead: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const member = await db.crmMember
    .update({
      where: { userId },
      data: { isLead: parsed.data.isLead },
      include: { user: { select: { id: true, name: true, surname: true, email: true } } },
    })
    .catch(() => null);
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ member });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  await db.crmMember.deleteMany({ where: { userId } });

  return NextResponse.json({ ok: true });
}
