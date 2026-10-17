import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManagePermissionsFor } from "@/lib/permissions";
import { issuePasswordResetCode } from "@/lib/password-reset";

/**
 * Emails a sign-in code straight to `id` — the same code the self-service
 * "Forgot password" flow sends, just triggered on someone else's behalf for
 * when they can't get to that flow themselves. Open to whoever could already
 * open the Permission Manager for this person: a company Admin for anyone,
 * or a Department Admin for someone sharing their own department.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, departmentId: true, isActive: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManagePermissionsFor(actor, target)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!target.isActive) return NextResponse.json({ error: "This account is blocked" }, { status: 400 });

  await issuePasswordResetCode(target);

  return NextResponse.json({ ok: true });
}
