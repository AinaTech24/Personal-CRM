import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewFormSubmissions } from "@/lib/forms";
import { csvRow, csvResponse } from "@/lib/csv";
import { istDateKey } from "@/lib/attendance";

/**
 * CSV export of every submission, one column per field (in builder order)
 * plus Submitted At. Same permission floor as the submissions list/detail —
 * admins, or whichever departments this form was explicitly shared with.
 *
 * PASSWORD fields are never exported in the clear: the submissions view
 * itself keeps them masked behind an explicit per-answer reveal, and a
 * downloaded file is far more likely to end up forwarded or left in a
 * Downloads folder than a screen someone's actively looking at.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: formId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    include: { viewerDepartments: { select: { departmentId: true } } },
  });
  if (!form || form.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [fields, submissions] = await Promise.all([
    db.formField.findMany({
      where: { formId, type: { notIn: ["SECTION_HEADING", "PAGE_BREAK"] } },
      orderBy: { order: "asc" },
      select: { id: true, label: true, type: true },
    }),
    db.formSubmission.findMany({
      where: { formId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        answers: { select: { value: true, fieldId: true } },
        attachments: { select: { fileName: true, fieldId: true } },
      },
    }),
  ]);

  // Builder labels aren't required to be unique — numbering a repeat keeps
  // the header row itself unambiguous without renaming anything the admin
  // actually typed.
  const seenLabels = new Map<string, number>();
  const headers = fields.map((f) => {
    const count = (seenLabels.get(f.label) ?? 0) + 1;
    seenLabels.set(f.label, count);
    return count > 1 ? `${f.label} (${count})` : f.label;
  });

  const lines = [csvRow(["Submitted At", ...headers])];
  for (const s of submissions) {
    const answerByField = new Map(s.answers.map((a) => [a.fieldId, a.value]));
    const filesByField = new Map<string, string[]>();
    for (const a of s.attachments) {
      filesByField.set(a.fieldId, [...(filesByField.get(a.fieldId) ?? []), a.fileName]);
    }

    const cells = fields.map((f) => {
      if (f.type === "PASSWORD") return answerByField.has(f.id) ? "(hidden)" : "";
      if (f.type === "FILE_SINGLE" || f.type === "FILE_MULTI") return (filesByField.get(f.id) ?? []).join(", ");
      const raw = answerByField.get(f.id) ?? "";
      return f.type === "CHECKBOX" ? raw.split("|").filter(Boolean).join(", ") : raw;
    });

    lines.push(csvRow([s.createdAt.toISOString(), ...cells]));
  }

  const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "form";
  return csvResponse(lines, `${slug}-submissions-${istDateKey()}.csv`);
}
