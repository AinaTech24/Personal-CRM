import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSessionCookie } from "@/lib/auth";
import { isValidMobile, normalizeMobile } from "@/lib/credentials";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  mobile: z.string().min(1),
  pin: z.string().min(1),
});

// Tighter than the password login's 10/5min: a 6-digit PIN is a much smaller
// space (1e6) than a real password, so both the per-IP and the per-mobile
// budget are deliberately smaller — an attacker rotating IPs against one
// victim's number is still capped by the per-mobile key below.
const LIMIT = 6;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your mobile number and PIN" }, { status: 400 });
  }

  const { mobile, pin } = parsed.data;
  if (!isValidMobile(mobile)) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
  }
  const normalizedMobile = normalizeMobile(mobile);

  const ip = requestDevice(req).ip ?? "unknown";
  const ipCheck = rateLimit(`login-pin:ip:${ip}`, LIMIT, WINDOW_MS);
  const mobileCheck = rateLimit(`login-pin:mobile:${normalizedMobile}`, LIMIT, WINDOW_MS);
  if (!ipCheck.allowed || !mobileCheck.allowed) {
    const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, mobileCheck.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const user = await db.user.findUnique({ where: { mobile: normalizedMobile } });
    if (!user || !user.isActive || !user.pinHash) {
      return NextResponse.json({ error: "Invalid mobile number or PIN" }, { status: 401 });
    }

    const valid = await verifyPassword(pin, user.pinHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid mobile number or PIN" }, { status: 401 });
    }

    await createSessionCookie(
      { userId: user.id, email: user.email, role: user.role, departmentId: user.departmentId },
      req
    );

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error("[api/auth/login-pin] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
