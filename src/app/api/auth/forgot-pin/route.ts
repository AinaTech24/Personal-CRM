import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isValidMobile, normalizeMobile } from "@/lib/credentials";
import { sendMail, pinResetCodeEmailHtml } from "@/lib/mailer";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ mobile: z.string().min(1) });

// Mirrors /api/auth/forgot's 5/15min — this also sends an email per success,
// so the limit guards against inbox-spamming as much as brute force. Also
// keyed per-mobile, since an IP-only cap is bypassable by rotating a
// spoofed/forwarded IP and would otherwise let an attacker spam one
// victim's inbox indefinitely.
const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid mobile number" }, { status: 400 });

  const { mobile } = parsed.data;
  if (!isValidMobile(mobile)) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
  }
  const normalizedMobile = normalizeMobile(mobile);

  const ip = requestDevice(req).ip ?? "unknown";
  const ipCheck = rateLimit(`forgot-pin:ip:${ip}`, LIMIT, WINDOW_MS);
  const mobileCheck = rateLimit(`forgot-pin:mobile:${normalizedMobile}`, LIMIT, WINDOW_MS);
  if (!ipCheck.allowed || !mobileCheck.allowed) {
    const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, mobileCheck.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const user = await db.user.findUnique({ where: { mobile: normalizedMobile } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "No active account found with that mobile number" }, { status: 404 });
    }

    // 6-digit code, stored hashed with a 10-minute expiry — same shape as the
    // email password-reset code, in its own columns so the two flows can't
    // clobber each other if someone triggers both at once.
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const pinResetCode = await hashPassword(code);
    await db.user.update({
      where: { id: user.id },
      data: { pinResetCode, pinResetCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    // Sent to the registered EMAIL, not the mobile — there's no SMS provider
    // wired up, and the point of this code is to prove the requester also
    // controls the account's email, not just knows its phone number.
    await sendMail({
      to: user.email,
      subject: "Reset your Aina CRM PIN",
      html: pinResetCodeEmailHtml({ name: user.name, code }),
    });

    return NextResponse.json({ ok: true, email: user.email });
  } catch (err) {
    console.error("[api/auth/forgot-pin] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
