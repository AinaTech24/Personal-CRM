import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSessionCookie } from "@/lib/auth";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(10),
});

// 10 attempts / 10 minutes per IP — the code itself is a 6-digit number that
// expires in 10 minutes (src/app/api/auth/forgot/route.ts), so the real
// defense is the expiry; this just stops a fast automated guess-loop from
// running through many attempts inside that window. Also keyed per-email:
// an IP-only cap is bypassable by rotating a spoofed/forwarded IP, and the
// per-email bucket is what actually bounds guesses against one victim's
// 1,000,000-code space within the code's lifetime.
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  const ip = requestDevice(req).ip ?? "unknown";
  const ipCheck = rateLimit(`verify-code:ip:${ip}`, LIMIT, WINDOW_MS);
  const emailCheck = rateLimit(`verify-code:email:${email}`, LIMIT, WINDOW_MS);
  if (!ipCheck.allowed || !emailCheck.allowed) {
    const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, emailCheck.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const user = await db.user.findUnique({ where: { email } });

    // Reject: unknown/blocked user, no code requested, expired code, or wrong code.
    if (!user || !user.isActive || !user.resetCode || !user.resetCodeExpiresAt) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    if (user.resetCodeExpiresAt < new Date()) {
      return NextResponse.json({ error: "This code has expired. Request a new one." }, { status: 401 });
    }
    const valid = await verifyPassword(parsed.data.code, user.resetCode);
    if (!valid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    // Consume the code (single use) and sign the user in. The WHERE clause
    // re-checks resetCode still equals the exact hash we just verified —
    // two concurrent requests can both pass verifyPassword above (it's a
    // read), but only one of them can win this update, since the loser's
    // WHERE no longer matches once the winner has already nulled it out.
    const claimed = await db.user.updateMany({
      where: { id: user.id, resetCode: user.resetCode },
      data: { resetCode: null, resetCodeExpiresAt: null },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "This code has already been used." }, { status: 409 });
    }
    await createSessionCookie(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
      },
      req
    );

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[api/auth/verify-code] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
