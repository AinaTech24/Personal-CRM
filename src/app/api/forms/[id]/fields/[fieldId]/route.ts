import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms } from "@/lib/forms";
import { serializeFieldOptions } from "@/lib/form-fields";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  placeholder: z.string().trim().max(200).nullable().optional(),
  helpText: z.string().trim().max(1000).nullable().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canManageForms(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId, fieldId } = await params;
  const existing = await db.formField.findFirst({ where: { id: fieldId, formId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const field = await db.formField.update({
    where: { id: fieldId },
    data: {
      ...(d.label !== undefined && { label: d.label }),
      ...(d.placeholder !== undefined && { placeholder: d.placeholder || null }),
      ...(d.helpText !== undefined && { helpText: d.helpText || null }),
      ...(d.required !== undefined && { required: d.required }),
      ...(d.options !== undefined && { options: serializeFieldOptions(d.options) || null }),
    },
  });

  return NextResponse.json({ field });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canManageForms(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId, fieldId } = await params;
  const existing = await db.formField.findFirst({ where: { id: fieldId, formId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.formField.delete({ where: { id: fieldId } });
  return NextResponse.json({ ok: true });
}
