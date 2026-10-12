import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageForms, canViewFormSubmissions, isUniqueConstraintError, uniqueFormSlug } from "@/lib/forms";
import { randomBytes } from "crypto";
import { slugify } from "@/lib/slug";

/**
 * Admins see every form (to build/edit/delete). A non-admin sees only the
 * forms whose submissions were shared with their department — read-only,
 * for the submissions table.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forms = await db.form.findMany({
    include: {
      viewerDepartments: { select: { departmentId: true } },
      _count: { select: { fields: true, submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const admin = isAdmin(user);
  const visible = admin
    ? forms
    : forms.filter((f) => canViewFormSubmissions(user, f.viewerDepartments.map((v) => v.departmentId)));

  return NextResponse.json({
    // A top-level flag, not just inferred from each row's canEdit — with zero
    // forms (a brand-new admin) there's no row to infer it from at all, which
    // previously hid the "New Form" button the moment the empty list loaded.
    canManage: admin,
    forms: visible.map((f) => ({
      id: f.id,
      title: f.title,
      slug: f.slug,
      isActive: f.isActive,
      createdAt: f.createdAt,
      fieldCount: f._count.fields,
      submissionCount: f._count.submissions,
      canEdit: admin,
    })),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageForms(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // The slug is checked for a collision up front, but two people creating
  // same-titled forms at the same instant could still both pass that check
  // before either write lands — retry once with a guaranteed-random slug
  // rather than surfacing the database's own unique-constraint error.
  let slug = await uniqueFormSlug(d.title);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = await db.form.create({
        data: { title: d.title, description: d.description || null, slug, createdById: user.id },
        select: { id: true, slug: true },
      });
      return NextResponse.json({ form }, { status: 201 });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      slug = `${slugify(d.title) || "form"}-${randomBytes(3).toString("hex")}`;
    }
  }
  return NextResponse.json({ error: "Couldn't generate a unique link for this form — try again" }, { status: 500 });
}
