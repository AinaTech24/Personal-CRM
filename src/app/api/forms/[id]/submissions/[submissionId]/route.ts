import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewFormSubmissions } from "@/lib/forms";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: formId, submissionId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    include: { viewerDepartments: { select: { departmentId: true } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submission = await db.formSubmission.findFirst({
    where: { id: submissionId, formId },
    select: {
      id: true,
      createdAt: true,
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
