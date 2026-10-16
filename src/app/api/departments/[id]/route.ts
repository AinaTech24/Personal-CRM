import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageDepartments, isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

/** The department itself, plus every member — the department's own admin console. Open to a company Admin for any department, or a Department Admin for their own. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isAdmin(user) && !(isDepartmentAdmin(user) && user.departmentId === id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const department = await db.department.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, name: true, surname: true, email: true, avatarDataUrl: true, role: true, isDepartmentAdmin: true, isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!department) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ department });
}

const patchSchema = z.object({ name: z.string().min(1).max(80) });

/** Rename a department. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageDepartments(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  const name = parsed.data.name.trim();

  // The slug is unique and derived from the name, so a rename has to move it
  // too — otherwise the record keeps a slug describing its old name, and the
  // next department to take that name collides with a row that no longer
  // resembles it.
  const slug = slugify(name);
  const clash = await db.department.findFirst({
    where: { slug, id: { not: id } },
    select: { id: true },
  });
  if (clash) return NextResponse.json({ error: "A department with that name already exists" }, { status: 409 });

  const department = await db.department.update({ where: { id }, data: { name, slug } });
  return NextResponse.json({ department });
}

/**
 * Delete a department.
 *
 * Refused while anything still points at it. The relations are mostly
 * restrictive or nullable rather than cascading, so deleting a populated
 * department would either fail deep in the database or quietly orphan records —
 * neither of which reads as an answer. Say what's in the way instead.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageDepartments(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const department = await db.department.findUnique({
    where: { id },
    select: {
      id: true,
      // Every relation, not just users: a department also owns leads, projects,
      // quotations, invoices, open invites, and Password Manager entries
      // (that one's required, not nullable — leaving it out would fail deep
      // in the database instead of here), and any one of them left behind
      // would fail in the database rather than here. formViewerDepartments
      // is the one relation that *would* actually cascade-delete cleanly,
      // but silently dropping a department's form-sharing config without
      // saying so is still worth surfacing rather than doing quietly.
      _count: {
        select: {
          users: true,
          leads: true,
          projects: true,
          quotations: true,
          invoices: true,
          invites: true,
          passwordEntries: true,
          formViewers: true,
        },
      },
    },
  });
  if (!department) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blocking = Object.entries(department._count)
    .filter(([, n]) => n > 0)
    .map(([relation, n]) => `${n} ${relation}`);
  if (blocking.length > 0) {
    return NextResponse.json(
      { error: `Still in use by ${blocking.join(", ")}. Move or remove them first.` },
      { status: 409 }
    );
  }

  await db.department.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
