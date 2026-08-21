import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPasswordEntryForUser, canManagePasswordEntry, logPasswordActivity } from "@/lib/passwords";

/** Revokes one user's shared access. Anyone who can manage the entry can remove any share; a shared-to user may also remove their own (self-service "leave"). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, userId } = await params;
  const access = await getPasswordEntryForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canManage = canManagePasswordEntry(user, access);
  if (!canManage && userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await db.passwordEntryShare.findUnique({
    where: { passwordEntryId_userId: { passwordEntryId: id, userId } },
    include: { user: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not shared with this user" }, { status: 404 });

  await db.passwordEntryShare.delete({ where: { passwordEntryId_userId: { passwordEntryId: id, userId } } });
  await logPasswordActivity(id, user.id, "unshared", { userId, name: existing.user.name });

  return NextResponse.json({ ok: true });
}
