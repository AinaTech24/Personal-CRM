import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPasswordEntryForUser, canManagePasswordEntry, logPasswordActivity } from "@/lib/passwords";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { notifyAndPush } from "@/lib/notify";

/** Revokes one user's shared access. Anyone who can manage the entry can remove any share; a shared-to user may also remove their own (self-service "leave"), which doesn't notify anyone since they did it themselves. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isUngrantedModuleHidden(user, "passwords")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  if (userId !== user.id) {
    await notifyAndPush(
      userId,
      "password_entry_revoked",
      { passwordEntryId: id, label: access.label, actorName: user.name },
      { title: "Password access revoked", body: `${user.name} revoked your access to "${access.label}"`, url: "/passwords", tag: "password-revoked" }
    );
  }

  return NextResponse.json({ ok: true });
}
