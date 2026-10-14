import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewFormSubmissions } from "@/lib/forms";
import { mimeTypeFor } from "@/lib/uploads";

/** Serves one form-submission attachment straight from its base64 MySQL column. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string; attachmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: formId, submissionId, attachmentId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    include: { viewerDepartments: { select: { departmentId: true } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachment = await db.formAttachment.findFirst({ where: { id: attachmentId, submissionId } });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inline = req.nextUrl.searchParams.get("mode") === "view";
  const buffer = Buffer.from(attachment.data, "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeFor(attachment.fileName),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(attachment.fileName)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
