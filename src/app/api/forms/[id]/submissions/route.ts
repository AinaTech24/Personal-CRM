import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewFormSubmissions } from "@/lib/forms";

/** Admins, plus whichever departments this specific form was shared with. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: formId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    include: { viewerDepartments: { select: { departmentId: true } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submissions = await db.formSubmission.findMany({
    where: { formId },
    select: {
      id: true,
      createdAt: true,
      _count: { select: { attachments: true } },
      // A short preview for the list row — the first couple of short-text-like
      // answers, so the table isn't just a column of dates.
      answers: {
        where: { field: { type: { in: ["SHORT_TEXT", "EMAIL", "PHONE"] } } },
        orderBy: { field: { order: "asc" } },
        take: 2,
        select: { value: true, field: { select: { label: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ submissions });
}
