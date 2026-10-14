import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms } from "@/lib/forms";
import { FORM_FIELD_TYPES, serializeFieldOptions } from "@/lib/form-fields";

const bodySchema = z.object({
  type: z.enum(FORM_FIELD_TYPES),
  label: z.string().trim().min(1).max(200),
  placeholder: z.string().trim().max(200).nullable().optional(),
  helpText: z.string().trim().max(1000).nullable().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

/** Admin only — appends a new field to the end of the form. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId } = await params;
  const form = await db.form.findUnique({ where: { id: formId }, select: { id: true } });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const last = await db.formField.findFirst({ where: { formId }, orderBy: { order: "desc" }, select: { order: true } });

  const field = await db.formField.create({
    data: {
      formId,
      type: d.type,
      label: d.label,
      placeholder: d.placeholder || null,
      helpText: d.helpText || null,
      required: d.required ?? false,
      options: d.options ? serializeFieldOptions(d.options) : null,
      order: (last?.order ?? -1) + 1,
    },
  });

  return NextResponse.json({ field }, { status: 201 });
}
