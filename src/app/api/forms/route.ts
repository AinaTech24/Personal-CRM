import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms, isUniqueConstraintError, uniqueFormSlug } from "@/lib/forms";

/**
 * Admins and department admins (Social Media/CRM leads) see every form (to
 * build/edit/delete). Anyone else sees only the forms whose submissions were
 * shared with their department — read-only, for the submissions table.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forms = await db.form.findMany({
    include: {
      viewerDepartments: { select: { departmentId: true } },
      department: { select: { id: true, name: true } },
      _count: { select: { fields: true, submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const canManage = await canManageForms(user);
  const visible = canManage
    ? forms
    : forms.filter((f) => user.departmentId && f.viewerDepartments.some((v) => v.departmentId === user.departmentId));

  return NextResponse.json({
    // A top-level flag, not just inferred from each row's canEdit — with zero
    // forms (a brand-new admin) there's no row to infer it from at all, which
    // previously hid the "New Form" button the moment the empty list loaded.
    canManage,
    forms: visible.map((f) => ({
      id: f.id,
      title: f.title,
      slug: f.slug,
      isActive: f.isActive,
      createdAt: f.createdAt,
      fieldCount: f._count.fields,
      submissionCount: f._count.submissions,
      canEdit: canManage,
      department: f.department,
    })),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // uniqueFormSlug already checks for a collision up front, but two people
  // creating a form at the same instant could still both pass that check
  // before either write lands — retry with a freshly-generated hash rather
  // than surfacing the database's own unique-constraint error.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueFormSlug();
    try {
      const form = await db.form.create({
        data: { title: d.title, description: d.description || null, slug, createdById: user.id },
        select: { id: true, slug: true },
      });
      return NextResponse.json({ form }, { status: 201 });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
  return NextResponse.json({ error: "Couldn't generate a unique link for this form — try again" }, { status: 500 });
}
