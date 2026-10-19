import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms, uniqueFormSlug } from "@/lib/forms";

/**
 * Clones a form — fields and the departments it's shared with, but never
 * its submissions/answers, since those belong to the original. The copy
 * always gets its own fresh slug (never the source's, even if the source
 * has lockSlug set) and starts inactive, so it can't collect public
 * submissions before whoever cloned it has reviewed it and published it.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const source = await db.form.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { order: "asc" } },
      viewerDepartments: { select: { departmentId: true } },
    },
  });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const slug = await uniqueFormSlug();
  const form = await db.form.create({
    data: {
      title: `${source.title} (Copy)`,
      description: source.description,
      slug,
      isActive: false,
      createdById: user.id,
      fields: {
        create: source.fields.map((f) => ({
          type: f.type,
          label: f.label,
          placeholder: f.placeholder,
          helpText: f.helpText,
          required: f.required,
          order: f.order,
          options: f.options,
        })),
      },
      viewerDepartments: {
        create: source.viewerDepartments.map((v) => ({ departmentId: v.departmentId })),
      },
    },
    select: { id: true, slug: true },
  });

  return NextResponse.json({ form }, { status: 201 });
}
