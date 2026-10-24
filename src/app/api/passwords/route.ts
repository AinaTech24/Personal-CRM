import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { passwordEntryListWhere, canManagePasswordEntry, logPasswordActivity } from "@/lib/passwords";
import { fetchFaviconDataUrl } from "@/lib/favicon";
import { encryptSecret } from "@/lib/crypto";

const entrySelect = {
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
  _count: { select: { shares: true } },
  // Never select `password` into a list — the reveal endpoint is the only
  // place it ever leaves the server, and every call there is logged.
};

/** Every entry the current user can see: their own department's, plus anything shared to them directly. Admins see everything. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db.passwordEntry.findMany({
    where: passwordEntryListWhere(user),
    select: entrySelect,
    orderBy: { updatedAt: "desc" },
  });

  // Whether THIS entry can be edited/deleted/shared by the current user —
  // computed here so the UI never has to re-derive the same department/admin
  // check client-side. An entry the user can only see via a share (not their
  // own department) comes back with canManage: false.
  const withPermissions = entries.map((e) => ({ ...e, canManage: canManagePasswordEntry(user, e) }));

  return NextResponse.json({ entries: withPermissions });
}

const bodySchema = z.object({
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  link: z.string().trim().max(2000).optional().nullable(),
  username: z.string().trim().max(200).optional().nullable(),
  password: z.string().min(1).max(500),
  /// Only an admin (or a user without a department of their own) may pick a
  /// different department than their own — see the route body below.
  departmentId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // A regular department user's entry always belongs to their own department —
  // only an admin (or someone with no department of their own to default to)
  // gets to choose one explicitly.
  const departmentId = isAdmin(user) || !user.departmentId ? d.departmentId : user.departmentId;
  if (!departmentId) {
    return NextResponse.json({ error: "A department is required — you don't have one of your own, so pick one." }, { status: 400 });
  }
  const department = await db.department.findUnique({ where: { id: departmentId } });
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  const link = d.link?.trim() || null;
  const faviconDataUrl = link ? await fetchFaviconDataUrl(link) : null;

  const entry = await db.passwordEntry.create({
    data: {
      label: d.label,
      description: d.description?.trim() || null,
      link,
      username: d.username?.trim() || null,
      password: encryptSecret(d.password),
      faviconDataUrl,
      departmentId,
      createdById: user.id,
    },
    select: entrySelect,
  });

  await logPasswordActivity(entry.id, user.id, "created");

  return NextResponse.json({ entry }, { status: 201 });
}
