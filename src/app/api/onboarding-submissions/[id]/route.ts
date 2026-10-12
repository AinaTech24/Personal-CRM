import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewOnboardingSubmissions } from "@/lib/onboarding";

/** Admins and the Development department only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canViewOnboardingSubmissions(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const submission = await db.onboardingSubmission.findUnique({
    where: { id },
    include: {
      // Never select `data` here — attachments are served one at a time by
      // their own route so the detail payload stays small.
      attachments: { select: { id: true, kind: true, fileName: true, createdAt: true } },
    },
  });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ submission });
}
