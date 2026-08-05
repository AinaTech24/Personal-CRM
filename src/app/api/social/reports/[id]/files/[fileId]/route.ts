import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialReportForUser, logSocialClientActivity } from "@/lib/social-media";

/** Removes one file from a report. "Replace" is just remove-then-upload from the UI's point of view. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, fileId } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialReportForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = await db.socialReportFile.findFirst({ where: { id: fileId, reportId: id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.socialReportFile.delete({ where: { id: fileId } });
  await logSocialClientActivity(access.clientId, user.id, "monthly_report_updated", { year: access.year, month: access.month, fileRemoved: file.fileName });

  return NextResponse.json({ ok: true });
}
