import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms } from "@/lib/forms";
import { CONDITION_OPERATORS, serializeFieldOptions } from "@/lib/form-fields";

const CONDITION_OPERATOR_VALUES = CONDITION_OPERATORS.map((o) => o.value) as [string, ...string[]];

const patchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  placeholder: z.string().trim().max(200).nullable().optional(),
  helpText: z.string().trim().max(1000).nullable().optional(),
  required: z.boolean().optional(),
  // No "|" — options are packed into one pipe-separated column (serializeFieldOptions), and an
  // option containing one would silently split into two, or merge with a checkbox answer's own delimiter.
  options: z.array(z.string().trim().min(1).max(200).regex(/^[^|]+$/, 'Options can\'t contain "|"')).max(50).optional(),
  minLength: z.number().int().min(0).max(5000).nullable().optional(),
  maxLength: z.number().int().min(0).max(5000).nullable().optional(),
  minValue: z.number().int().nullable().optional(),
  maxValue: z.number().int().nullable().optional(),
  pattern: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .refine((p) => {
      if (!p) return true;
      try {
        new RegExp(p);
        return true;
      } catch {
        return false;
      }
    }, "Invalid pattern"),
  currencySymbol: z.string().trim().max(10).nullable().optional(),
  conditionFieldId: z.string().nullable().optional(),
  conditionOperator: z.enum(CONDITION_OPERATOR_VALUES).nullable().optional(),
  conditionValue: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user, "UPDATE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId, fieldId } = await params;
  const existing = await db.formField.findFirst({ where: { id: fieldId, formId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // A condition needs both a target field and an operator — clearing the
  // target clears the whole condition instead of leaving a dangling
  // operator/value around.
  let conditionPatch: { conditionFieldId: string | null; conditionOperator: string | null; conditionValue: string | null } | undefined;
  if (d.conditionFieldId !== undefined) {
    if (!d.conditionFieldId) {
      conditionPatch = { conditionFieldId: null, conditionOperator: null, conditionValue: null };
    } else {
      // Only an earlier field (lower display order) may gate this one — the
      // builder only offers those as options, so anything else here is either
      // a stale client or a cross-form id, neither of which should be saved.
      const target = await db.formField.findFirst({ where: { id: d.conditionFieldId, formId }, select: { order: true } });
      if (!target || target.order >= existing.order) {
        return NextResponse.json({ error: "Invalid condition target" }, { status: 400 });
      }
      conditionPatch = {
        conditionFieldId: d.conditionFieldId,
        conditionOperator: d.conditionOperator ?? existing.conditionOperator ?? "is_filled",
        conditionValue: d.conditionValue ?? existing.conditionValue ?? "",
      };
    }
  } else if (d.conditionOperator !== undefined || d.conditionValue !== undefined) {
    conditionPatch = {
      conditionFieldId: existing.conditionFieldId,
      conditionOperator: d.conditionOperator !== undefined ? d.conditionOperator : existing.conditionOperator,
      conditionValue: d.conditionValue !== undefined ? d.conditionValue || "" : existing.conditionValue,
    };
  }

  const field = await db.formField.update({
    where: { id: fieldId },
    data: {
      ...(d.label !== undefined && { label: d.label }),
      ...(d.placeholder !== undefined && { placeholder: d.placeholder || null }),
      ...(d.helpText !== undefined && { helpText: d.helpText || null }),
      ...(d.required !== undefined && { required: d.required }),
      ...(d.options !== undefined && { options: serializeFieldOptions(d.options) || null }),
      ...(d.minLength !== undefined && { minLength: d.minLength }),
      ...(d.maxLength !== undefined && { maxLength: d.maxLength }),
      ...(d.minValue !== undefined && { minValue: d.minValue }),
      ...(d.maxValue !== undefined && { maxValue: d.maxValue }),
      ...(d.pattern !== undefined && { pattern: d.pattern || null }),
      ...(d.currencySymbol !== undefined && { currencySymbol: d.currencySymbol || null }),
      ...(conditionPatch ?? {}),
    },
  });

  return NextResponse.json({ field });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user, "DELETE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId, fieldId } = await params;
  const existing = await db.formField.findFirst({ where: { id: fieldId, formId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.formField.delete({ where: { id: fieldId } });
  return NextResponse.json({ ok: true });
}
