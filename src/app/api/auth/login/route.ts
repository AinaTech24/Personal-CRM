import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSessionCookie } from "@/lib/auth";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// 10 attempts / 5 minutes per IP — generous for a real person mistyping a
// password, tight enough to blunt an automated credential-stuffing run.
// Also keyed per-email: the IP in `requestDevice` ultimately comes from a
// header, and even with a trusted reverse proxy in front of this app, an
// IP-only cap is one spoofed/rotated address away from unlimited guesses
// against a single account, so the per-email bucket is the one that
// actually bounds attempts against any one victim.
const LIMIT = 10;
const WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const ip = requestDevice(req).ip ?? "unknown";
  const ipCheck = rateLimit(`login:ip:${ip}`, LIMIT, WINDOW_MS);
  const emailCheck = rateLimit(`login:email:${normalizedEmail}`, LIMIT, WINDOW_MS);
  if (!ipCheck.allowed || !emailCheck.allowed) {
    const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, emailCheck.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
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

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error("[api/auth/login] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
