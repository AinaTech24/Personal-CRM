import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clearPendingMfaCookie, createSessionCookie, getPendingMfaFromCookies, verifyPassword } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeBackupCode, verifyTotpCode } from "@/lib/totp";

const bodySchema = z.object({ code: z.string().min(1).max(32) });

// A 6-digit TOTP code only has ~1e6 values (and the window below accepts 3 of
// them at once), so this stays tight — much tighter than the password/PIN
// login limits — while still giving a real person room for a mistyped code.
const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;

/** Finishes a password/PIN/email-code login that was held pending because the account has 2FA enabled. */
export async function POST(req: NextRequest) {
  const pending = await getPendingMfaFromCookies();
  if (!pending) {
    return NextResponse.json({ error: "Your sign-in attempt expired. Log in again." }, { status: 401 });
  }

  const ip = requestDevice(req).ip ?? "unknown";
  const ipCheck = rateLimit(`verify-2fa:ip:${ip}`, LIMIT, WINDOW_MS);
  const userCheck = rateLimit(`verify-2fa:user:${pending.userId}`, LIMIT, WINDOW_MS);
  if (!ipCheck.allowed || !userCheck.allowed) {
    const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, userCheck.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the code" }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
    await clearPendingMfaCookie();
    return NextResponse.json({ error: "Two-factor authentication is no longer available. Log in again." }, { status: 401 });
  }

  const digitsOnly = parsed.data.code.replace(/\s+/g, "");
  let authenticated = false;
  let consumedBackupCodeIndex = -1;
  let remainingBackupHashes: string[] = [];

  if (/^\d{6}$/.test(digitsOnly)) {
    authenticated = await verifyTotpCode(decryptSecret(user.totpSecret), digitsOnly);
  } else if (user.totpBackupCodesHash) {
    const normalized = normalizeBackupCode(parsed.data.code);
    const hashes: string[] = JSON.parse(user.totpBackupCodesHash);
    for (let i = 0; i < hashes.length; i++) {
      if (await verifyPassword(normalized, hashes[i])) {
        authenticated = true;
        consumedBackupCodeIndex = i;
        remainingBackupHashes = hashes.filter((_, idx) => idx !== i);
        break;
      }
    }
  }

  if (!authenticated) {
    return NextResponse.json({ error: "Incorrect code" }, { status: 401 });
  }

  if (consumedBackupCodeIndex >= 0) {
    await db.user.update({
      where: { id: user.id },
      data: { totpBackupCodesHash: remainingBackupHashes.length ? JSON.stringify(remainingBackupHashes) : null },
    });
  }

  await clearPendingMfaCookie();
  await createSessionCookie(
    { userId: user.id, email: user.email, role: user.role, departmentId: user.departmentId },
    req
  );

  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}
