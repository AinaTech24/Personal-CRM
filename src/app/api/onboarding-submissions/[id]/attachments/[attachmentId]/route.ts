import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewOnboardingSubmissions } from "@/lib/onboarding";
import { mimeTypeFor } from "@/lib/uploads";

/** Serves one onboarding attachment straight from its base64 MySQL column. Admins and the Development department only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canViewOnboardingSubmissions(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, attachmentId } = await params;
  const attachment = await db.onboardingAttachment.findFirst({ where: { id: attachmentId, submissionId: id } });
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
