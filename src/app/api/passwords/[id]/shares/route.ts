import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPasswordEntryForUser, canManagePasswordEntry, logPasswordActivity } from "@/lib/passwords";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { notifyAndPush } from "@/lib/notify";

const bodySchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(50) });

/** Grants access to one or more users at once — the Share dialog's "add selected users" action. Already-shared users are silently skipped, not errored. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isUngrantedModuleHidden(user, "passwords")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const access = await getPasswordEntryForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManagePasswordEntry(user, access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const targetIds = [...new Set(parsed.data.userIds)].filter((uid) => uid !== user.id || true); // sharing with self is harmless, just pointless — not worth special-casing
  const targets = await db.user.findMany({ where: { id: { in: targetIds }, isActive: true }, select: { id: true, name: true } });
  if (targets.length === 0) return NextResponse.json({ error: "No valid users" }, { status: 400 });

  const existing = await db.passwordEntryShare.findMany({
    where: { passwordEntryId: id, userId: { in: targets.map((t) => t.id) } },
    select: { userId: true },
  });
  const alreadyShared = new Set(existing.map((s) => s.userId));
  const toAdd = targets.filter((t) => !alreadyShared.has(t.id));

  if (toAdd.length > 0) {
    await db.passwordEntryShare.createMany({
      data: toAdd.map((t) => ({ passwordEntryId: id, userId: t.id, sharedById: user.id })),
    });
    await logPasswordActivity(id, user.id, "shared", { userIds: toAdd.map((t) => t.id), names: toAdd.map((t) => t.name) });
    for (const t of toAdd) {
      if (t.id === user.id) continue;
      await notifyAndPush(
        t.id,
        "password_entry_shared",
        { passwordEntryId: id, label: access.label, actorName: user.name },
        { title: "A password was shared with you", body: `${user.name} shared "${access.label}" with you`, url: "/passwords", tag: "password-shared" }
      );
    }
  }

  const shares = await db.passwordEntryShare.findMany({
    where: { passwordEntryId: id },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, surname: true, email: true } },
      sharedById: true,
      sharedBy: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ shares }, { status: 201 });
}
