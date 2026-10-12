import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms } from "@/lib/forms";

const bodySchema = z.object({ fieldIds: z.array(z.string()).min(1) });

/** Admin only — the builder sends the full field-id order after a drag-and-drop reorder. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canManageForms(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const fields = await db.formField.findMany({ where: { formId }, select: { id: true } });
  const validIds = new Set(fields.map((f) => f.id));
  const ids = parsed.data.fieldIds.filter((id) => validIds.has(id));

  await db.$transaction(ids.map((id, order) => db.formField.update({ where: { id }, data: { order } })));

  return NextResponse.json({ ok: true });
}
