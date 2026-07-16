import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendMail, resetCodeEmailHtml } from "@/lib/mailer";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "No active account found with that email" }, { status: 404 });
  }

  // 6-digit code, stored hashed with a 10-minute expiry.
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

  return NextResponse.json({ ok: true });
}
