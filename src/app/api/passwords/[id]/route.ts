import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getPasswordEntryForUser, canManagePasswordEntry, logPasswordActivity } from "@/lib/passwords";
import { fetchFaviconDataUrl } from "@/lib/favicon";
import { summariseChanges } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";

const entryDetailSelect = {
  id: true,
  label: true,
  description: true,
  link: true,
  username: true,
  faviconDataUrl: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  createdById: true,
  createdBy: { select: { id: true, name: true, surname: true } },
  updatedById: true,
  updatedBy: { select: { id: true, name: true, surname: true } },
  createdAt: true,
  updatedAt: true,
  shares: {
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, surname: true, email: true } },
      sharedById: true,
      sharedBy: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
  activities: {
    select: { id: true, action: true, meta: true, createdAt: true, actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getPasswordEntryForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entry = await db.passwordEntry.findUnique({ where: { id }, select: entryDetailSelect });
  return NextResponse.json({ entry: entry && { ...entry, canManage: canManagePasswordEntry(user, access) } });
}

const patchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  link: z.string().trim().max(2000).nullable().optional(),
  username: z.string().trim().max(200).nullable().optional(),
  /// Omit or send an empty string to leave the stored password unchanged.
  password: z.string().max(500).optional(),
  departmentId: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getPasswordEntryForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManagePasswordEntry(user, access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  let departmentId: string | undefined;
  if (d.departmentId !== undefined) {
    if (!isAdmin(user)) return NextResponse.json({ error: "Only an admin can move an entry to another department" }, { status: 403 });
    const department = await db.department.findUnique({ where: { id: d.departmentId } });
    if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });
    departmentId = d.departmentId;
  }

  const linkChanged = d.link !== undefined && (d.link?.trim() || null) !== access.link;
  const nextLink = d.link !== undefined ? d.link?.trim() || null : undefined;
  const faviconDataUrl = linkChanged ? (nextLink ? await fetchFaviconDataUrl(nextLink) : null) : undefined;

  const entry = await db.passwordEntry.update({
    where: { id },
    data: {
      ...(d.label !== undefined && { label: d.label }),
      ...(d.description !== undefined && { description: d.description?.trim() || null }),
      ...(nextLink !== undefined && { link: nextLink }),
      ...(faviconDataUrl !== undefined && { faviconDataUrl }),
      ...(d.username !== undefined && { username: d.username?.trim() || null }),
      ...(d.password && { password: encryptSecret(d.password), rotationReminderSentAt: null }),
      ...(departmentId !== undefined && { departmentId }),
      updatedById: user.id,
    },
    select: entryDetailSelect,
  });

  const changes = summariseChanges({
    label: d.label,
    description: d.description,
    link: nextLink,
    username: d.username,
    departmentId,
    passwordChanged: d.password ? true : undefined,
  });
  await logPasswordActivity(id, user.id, "updated", changes ?? undefined);

  return NextResponse.json({ entry });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getPasswordEntryForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManagePasswordEntry(user, access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.passwordEntry.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
