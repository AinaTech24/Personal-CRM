import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendMail, resetCodeEmailHtml } from "@/lib/mailer";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ email: z.string().email() });

// 5 requests / 15 minutes per IP — this sends an email per success, so a loose
// limit here isn't just a brute-force risk, it's a way to spam someone else's
// inbox with reset codes. Also keyed per-email, since an IP-only cap is
// bypassable by rotating a spoofed/forwarded IP and would otherwise let an
// attacker email-bomb one victim indefinitely.
const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  const ip = requestDevice(req).ip ?? "unknown";
  const ipCheck = rateLimit(`forgot:ip:${ip}`, LIMIT, WINDOW_MS);
  const emailCheck = rateLimit(`forgot:email:${email}`, LIMIT, WINDOW_MS);
  if (!ipCheck.allowed || !emailCheck.allowed) {
    const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, emailCheck.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
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
  } catch (err) {
    console.error("[api/auth/forgot] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
