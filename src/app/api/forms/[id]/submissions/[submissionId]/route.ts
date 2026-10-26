import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms, canViewFormSubmissions } from "@/lib/forms";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: formId, submissionId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    include: { viewerDepartments: { select: { departmentId: true } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submission = await db.formSubmission.findFirst({
    where: { id: submissionId, formId },
    select: {
      id: true,
      createdAt: true,
      convertedLeadId: true,
      answers: {
        orderBy: { field: { order: "asc" } },
        select: { id: true, value: true, field: { select: { id: true, label: true, type: true } } },
      },
      // Never select `data` here — attachments are served one at a time by their own route.
      attachments: {
        orderBy: { field: { order: "asc" } },
        select: { id: true, fileName: true, createdAt: true, field: { select: { id: true, label: true } } },
      },
    },
  });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ submission });
}

const patchSchema = z.object({
  // Keyed by field id; a CHECKBOX field sends an array, everything else a string.
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

/** Admin only — corrects a submitted answer. Attachments aren't editable here (delete the submission and ask for a fresh one if a file needs replacing). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId, submissionId } = await params;
  const submission = await db.formSubmission.findFirst({ where: { id: submissionId, formId }, select: { id: true } });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const fields = await db.formField.findMany({ where: { formId }, select: { id: true, type: true, required: true, label: true } });
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const existingAnswers = await db.formAnswer.findMany({ where: { submissionId }, select: { id: true, fieldId: true } });
  const answerByField = new Map(existingAnswers.map((a) => [a.fieldId, a.id]));

  for (const [fieldId, raw] of Object.entries(parsed.data.answers)) {
    const field = fieldById.get(fieldId);
    if (!field || field.type === "FILE_SINGLE" || field.type === "FILE_MULTI" || field.type === "SECTION_HEADING" || field.type === "PAGE_BREAK") continue;

    // Strip "|" from each piece before joining — it's the delimiter a multi-value (CHECKBOX)
    // answer is itself packed with, so a literal one in a value would silently split it in two.
    const value = Array.isArray(raw)
      ? raw.map((s) => s.replace(/\|/g, "").trim()).filter(Boolean).join("|")
      : raw.trim();
    if (field.required && !value) {
      return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
    }
    if (value.length > 5000) return NextResponse.json({ error: `"${field.label}" is too long` }, { status: 400 });

    const existingId = answerByField.get(fieldId);
    if (!value) {
      if (existingId) await db.formAnswer.delete({ where: { id: existingId } });
    } else if (existingId) {
      await db.formAnswer.update({ where: { id: existingId }, data: { value } });
    } else {
      await db.formAnswer.create({ data: { submissionId, fieldId, value } });
    }
  }

  const updated = await db.formSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      createdAt: true,
      answers: {
        orderBy: { field: { order: "asc" } },
        select: { id: true, value: true, field: { select: { id: true, label: true, type: true } } },
      },
      attachments: {
        orderBy: { field: { order: "asc" } },
        select: { id: true, fileName: true, createdAt: true, field: { select: { id: true, label: true } } },
      },
    },
  });

  return NextResponse.json({ submission: updated });
}

/** Admin only. Cascades to the submission's answers and attachments. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId, submissionId } = await params;
  const submission = await db.formSubmission.findFirst({ where: { id: submissionId, formId }, select: { id: true } });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.formSubmission.delete({ where: { id: submissionId } });
  return NextResponse.json({ ok: true });
}
