import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialReportForUser, logSocialClientActivity } from "@/lib/social-media";
import { saveReportFile, UploadValidationError } from "@/lib/uploads";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** Adds one file to a report. Multiple files per report — this never replaces, only appends. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialReportForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });
  }

  let filePath: string, fileName: string, data: string;
  try {
    ({ filePath, fileName, data } = await saveReportFile(id, file));
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const reportFile = await db.socialReportFile.create({
    data: { reportId: id, fileName, filePath, data, uploadedById: user.id },
    include: { uploadedBy: { select: { id: true, name: true } } },
    omit: { data: true },
  });

  await logSocialClientActivity(access.clientId, user.id, "monthly_report_updated", { year: access.year, month: access.month, fileAdded: fileName });

  return NextResponse.json({ file: reportFile }, { status: 201 });
}
