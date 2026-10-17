import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendMail, resetCodeEmailHtml } from "@/lib/mailer";

/**
 * Generates a fresh 6-digit sign-in code for `user`, stores it hashed with a
 * 10-minute expiry, and emails it to them — entering it signs them straight
 * in (see /api/auth/verify-code), no old password needed. Shared by the
 * self-service "Forgot password" flow (/api/auth/forgot) and an
 * admin/department-admin-triggered reset from the Departments page.
 */
export async function issuePasswordResetCode(user: { id: string; name: string; email: string }) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const resetCode = await hashPassword(code);
  await db.user.update({
    where: { id: user.id },
    data: { resetCode, resetCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });

  await sendMail({
    to: user.email,
    subject: "Your Aina CRM sign-in code",
    html: resetCodeEmailHtml({ name: user.name, code }),
  });
}
