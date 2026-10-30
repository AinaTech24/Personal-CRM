import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewFormSubmissions } from "@/lib/forms";

/**
 * Views (a simple page-load counter, see Form.viewCount), submissions, the
 * conversion rate between them, and a per-field fill rate — the share of
 * submissions that actually answered each field. That last one reads as
 * "drop-off" in spirit but isn't full visitor-abandonment tracking (this
 * app doesn't record a partial/abandoned attempt at all): it's computed
 * purely from completed submissions, so it says which fields people skip
 * once they do submit, not how many people leave partway through.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: formId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    select: {
      viewCount: true,
      deletedAt: true,
      viewerDepartments: { select: { departmentId: true } },
      fields: {
        where: { type: { notIn: ["SECTION_HEADING", "PAGE_BREAK"] } },
        orderBy: { order: "asc" },
        select: { id: true, label: true, type: true },
      },
    },
  });
  if (!form || form.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [submissionCount, answers, attachments] = await Promise.all([
    db.formSubmission.count({ where: { formId } }),
    db.formAnswer.findMany({ where: { submission: { formId } }, select: { fieldId: true, submissionId: true } }),
    db.formAttachment.findMany({ where: { submission: { formId } }, select: { fieldId: true, submissionId: true } }),
  ]);

  const submissionsByField = new Map<string, Set<string>>();
  for (const a of [...answers, ...attachments]) {
    const set = submissionsByField.get(a.fieldId) ?? new Set<string>();
    set.add(a.submissionId);
    submissionsByField.set(a.fieldId, set);
  }

  const fields = form.fields.map((f) => {
    const answeredCount = submissionsByField.get(f.id)?.size ?? 0;
    return { id: f.id, label: f.label, type: f.type, answeredCount, fillRate: submissionCount > 0 ? answeredCount / submissionCount : 0 };
  });

  return NextResponse.json({
    views: form.viewCount,
    submissions: submissionCount,
    conversionRate: form.viewCount > 0 ? submissionCount / form.viewCount : 0,
    fields,
  });
}
