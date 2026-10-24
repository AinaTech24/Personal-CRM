import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageTask } from "@/lib/tasks";
import { getProjectForUser } from "@/lib/projects";
import { getSocialMembership, getSocialImageForUser, getSocialReportForUser } from "@/lib/social-media";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import { mimeTypeFor } from "@/lib/uploads";

/** Serves task attachments and project documents straight from their base64 MySQL column. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path: segments } = await params;
  const relativePath = segments.join("/");
  const inline = req.nextUrl.searchParams.get("mode") === "view";
  const scope = segments[0];

  let fileName: string;
  let data: string | null;

  if (scope === "tasks") {
    const attachment = await db.taskAttachment.findFirst({
      where: { filePath: relativePath },
      include: { task: { select: { createdById: true, assignedToId: true, assignees: { select: { id: true } } } } },
    });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManageTask(user, attachment.task)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    fileName = attachment.fileName;
    data = attachment.data;
  } else if (scope === "projects") {
    const document = await db.projectDocument.findFirst({ where: { filePath: relativePath } });
    if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const access = await getProjectForUser(user, document.projectId);
    if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    fileName = document.fileName;
    data = document.data;
  } else if (scope === "reports") {
    const reportFile = await db.socialReportFile.findFirst({ where: { filePath: relativePath } });
    if (!reportFile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const membership = await getSocialMembership(user.id);
    const access = await getSocialReportForUser(user, membership, reportFile.reportId);
    if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    fileName = reportFile.fileName;
    data = reportFile.data;
  } else if (scope === "client-images") {
    const image = await db.socialClientImage.findFirst({ where: { filePath: relativePath } });
    if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const membership = await getSocialMembership(user.id);
    const access = await getSocialImageForUser(user, membership, image.id);
    if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    fileName = image.fileName;
    data = image.data;
  } else if (scope === "expenses") {
    const expense = await db.expense.findFirst({
      where: { receiptFilePath: relativePath },
      select: { userId: true, user: { select: { departmentId: true } }, receiptFileName: true, receiptData: true },
    });
    if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let canView = isAdmin(user) || expense.userId === user.id;
    if (!canView) {
      const expenseScope = await moduleAccessScope(user, "EXPENSES", "READ");
      canView = expenseScope === "all" || (expenseScope !== null && expense.user.departmentId === expenseScope.departmentId);
    }
    if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    fileName = expense.receiptFileName ?? "receipt";
    data = expense.receiptData;
  } else {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!data) return NextResponse.json({ error: "File data missing" }, { status: 404 });

  const buffer = Buffer.from(data, "base64");
  // SVG can carry a <script>, so an inline render of one is a stored-XSS
  // vector even though the upload itself was otherwise legitimate — force it
  // to download instead of forcing the browser to render it in-page.
  const isScriptCapable = fileName.toLowerCase().endsWith(".svg");
  const disposition = inline && !isScriptCapable ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeTypeFor(fileName),
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileName)}"`,
      // Belt-and-suspenders: even if Content-Type above is ever wrong for a
      // given file, this stops the browser from sniffing the body and
      // deciding to render/execute it as something else entirely.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
