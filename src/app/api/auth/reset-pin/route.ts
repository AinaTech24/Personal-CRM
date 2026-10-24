import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword, createSessionCookie } from "@/lib/auth";
import { isValidMobile, isValidPin, normalizeMobile } from "@/lib/credentials";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  mobile: z.string().min(1),
  code: z.string().min(4).max(10),
  newPin: z.string().min(1),
});

// Same rationale as /api/auth/verify-code: the OTP's own 10-minute expiry is
// the real defense, this just caps how many guesses a fast script gets
// against it inside that window.
const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { mobile, code, newPin } = parsed.data;
  if (!isValidMobile(mobile)) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
  }
  if (!isValidPin(newPin)) {
    return NextResponse.json({ error: "PIN must be exactly 6 digits" }, { status: 400 });
  }
  const normalizedMobile = normalizeMobile(mobile);

  const ip = requestDevice(req).ip ?? "unknown";
  const { allowed, retryAfterSeconds } = rateLimit(`reset-pin:${ip}:${normalizedMobile}`, LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const user = await db.user.findUnique({ where: { mobile: normalizedMobile } });

    if (!user || !user.isActive || !user.pinResetCode || !user.pinResetCodeExpiresAt) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    if (user.pinResetCodeExpiresAt < new Date()) {
      return NextResponse.json({ error: "This code has expired. Request a new one." }, { status: 401 });
    }
    const valid = await verifyPassword(code, user.pinResetCode);
    if (!valid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    // Same atomic-claim pattern as /api/auth/verify-code: the WHERE clause
    // re-checks pinResetCode still equals the exact hash just verified, so
    // two concurrent requests can't both win — only the first to update
    // wins, the second's WHERE no longer matches once it's cleared.
    const pinHash = await hashPassword(newPin);
    const claimed = await db.user.updateMany({
      where: { id: user.id, pinResetCode: user.pinResetCode },
      data: { pinHash, pinResetCode: null, pinResetCodeExpiresAt: null },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "This code has already been used." }, { status: 409 });
    }

    // Consistent with /api/auth/verify-code: a successful recovery signs the
    // user straight in rather than sending them back to a login screen.
    await createSessionCookie(
      { userId: user.id, email: user.email, role: user.role, departmentId: user.departmentId },
      req
    );

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[api/auth/reset-pin] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
