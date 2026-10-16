import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { issuePasswordResetCode } from "@/lib/password-reset";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ email: z.string().email() });

// 5 requests / 15 minutes per IP — this sends an email per success, so a loose
// limit here isn't just a brute-force risk, it's a way to spam someone else's
// inbox with reset codes.
const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = requestDevice(req).ip ?? "unknown";
  const { allowed, retryAfterSeconds } = rateLimit(`forgot:${ip}`, LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "No active account found with that email" }, { status: 404 });
    }

    await issuePasswordResetCode(user);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/forgot] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
