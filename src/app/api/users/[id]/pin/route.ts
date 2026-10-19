import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { isValidPin } from "@/lib/credentials";
import { sendMail, pinResetByAdminEmailHtml } from "@/lib/mailer";

/** Omitted `pin` (or an empty string) means "generate one" — an admin resetting
 *  a locked-out user doesn't necessarily want to invent a number on the spot. */
const patchSchema = z.object({
  pin: z.string().optional(),
  clear: z.boolean().optional(),
});

/**
 * Admin-driven PIN control — set, generate, or clear a user's sign-in PIN
 * directly, no OTP involved (the admin is already an authenticated,
 * authorized actor, unlike the self-service forgot-PIN flow). The affected
 * user gets an email saying their PIN changed, but the email never carries
 * the PIN itself — the admin who just set it shares it out of band.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canManage =
    isAdmin(admin) ||
    (isDepartmentAdmin(admin) && target.departmentId === admin.departmentId && target.role === "DEPARTMENT_USER");
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { pin, clear } = parsed.data;

  if (clear) {
    await db.user.update({ where: { id }, data: { pinHash: null, pinResetCode: null, pinResetCodeExpiresAt: null } });
    return NextResponse.json({ ok: true, pin: null });
  }

  if (!target.mobile) {
    return NextResponse.json({ error: "This user has no mobile number on file yet" }, { status: 400 });
  }

  let newPin = pin;
  if (newPin) {
    if (!isValidPin(newPin)) return NextResponse.json({ error: "PIN must be exactly 6 digits" }, { status: 400 });
  } else {
    newPin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  const pinHash = await hashPassword(newPin);
  await db.user.update({
    where: { id },
    data: { pinHash, pinResetCode: null, pinResetCodeExpiresAt: null },
  });

  await sendMail({
    to: target.email,
    subject: "Your Aina CRM PIN was reset",
    html: pinResetByAdminEmailHtml({ name: target.name, adminName: admin.name }),
  }).catch((err) => console.error("[api/users/[id]/pin] notification email failed:", err));

  // Only returned when the admin didn't supply one themselves — the whole
  // point of generating it here is so they have something to hand over.
  return NextResponse.json({ ok: true, pin: pin ? null : newPin });
}
