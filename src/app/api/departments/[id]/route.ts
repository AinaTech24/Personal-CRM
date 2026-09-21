import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageDepartments } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isAnalystDept: z.boolean().optional(),
  hasClientsModule: z.boolean().optional(),
});

/** Rename a department, and/or toggle its isAnalystDept / hasClientsModule flags. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageDepartments(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  let nameUpdate: { name: string; slug: string } | null = null;
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

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
    nameUpdate = { name, slug };
  }

  const department = await db.department.update({
    where: { id },
    data: {
      ...nameUpdate,
      ...(data.isAnalystDept !== undefined && { isAnalystDept: data.isAnalystDept }),
      ...(data.hasClientsModule !== undefined && { hasClientsModule: data.hasClientsModule }),
    },
  });
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
      // quotations, invoices and open invites, and any one of them left behind
      // would fail in the database rather than here.
      _count: { select: { users: true, leads: true, projects: true, quotations: true, invoices: true, invites: true } },
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
