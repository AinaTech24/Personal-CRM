import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createTotpSetupCookie, getCurrentUser, verifyPassword } from "@/lib/auth";
import { generateTotpSecret, totpKeyUri } from "@/lib/totp";

const bodySchema = z.object({ password: z.string().min(1) });

/** Starts 2FA setup: generates a new TOTP secret and returns a QR code to scan with an authenticator app. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.totpEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is already enabled." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your password" }, { status: 400 });

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  const secret = generateTotpSecret();
  await createTotpSetupCookie(secret);

  const qrCodeDataUrl = await QRCode.toDataURL(totpKeyUri(user.email, secret));
  return NextResponse.json({ secret, qrCodeDataUrl });
}
