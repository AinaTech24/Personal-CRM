import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms, canViewFormSubmissions } from "@/lib/forms";

const formInclude = {
  fields: { orderBy: { order: "asc" as const } },
  viewerDepartments: { select: { departmentId: true, department: { select: { id: true, name: true } } } },
  department: { select: { id: true, name: true } },
};

/** The builder (admin) loads a form this way; a viewer-department's submissions page also needs the field list to label columns. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const form = await db.form.findUnique({ where: { id }, include: formInclude });
  if (!form || form.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canEdit = await canManageForms(user);
  if (!canEdit && !(await canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ form: { ...form, canEdit } });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  /** When true, copying the link never rotates it — see Form.lockSlug. */
  lockSlug: z.boolean().optional(),
  /** Replaces the full set of departments (besides Admins) who can view this form's submissions. */
  viewerDepartmentIds: z.array(z.string()).optional(),
  /** Which department this form was built for — distinct from viewerDepartmentIds. Null clears it. */
  departmentId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user, "UPDATE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.form.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  if (d.departmentId) {
    const department = await db.department.findUnique({ where: { id: d.departmentId } });
    if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  await db.$transaction(async (tx) => {
    await tx.form.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description || null }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
        ...(d.lockSlug !== undefined && { lockSlug: d.lockSlug }),
        ...(d.departmentId !== undefined && { departmentId: d.departmentId }),
      },
    });
    if (d.viewerDepartmentIds !== undefined) {
      await tx.formViewerDepartment.deleteMany({ where: { formId: id } });
      if (d.viewerDepartmentIds.length > 0) {
        await tx.formViewerDepartment.createMany({
          data: d.viewerDepartmentIds.map((departmentId) => ({ formId: id, departmentId })),
        });
      }
    }
  });

  const form = await db.form.findUnique({ where: { id }, include: formInclude });
  return NextResponse.json({ form: { ...form, canEdit: true } });
}

/** Soft delete — moves the form to Trash rather than removing it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user, "DELETE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await db.form.update({ where: { id }, data: { deletedAt: new Date(), deletedById: user.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
