import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { consumeTotpSetupCookie, getCurrentUser, hashPassword } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { formatBackupCode, generateBackupCodes, verifyTotpCode } from "@/lib/totp";

const bodySchema = z.object({ code: z.string().min(1) });

/** Confirms the first code from the authenticator app, then turns 2FA on and issues one-time backup codes. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 });

  const secret = await consumeTotpSetupCookie();
  if (!secret) {
    return NextResponse.json({ error: "This setup attempt expired. Start again." }, { status: 400 });
  }

  const valid = await verifyTotpCode(secret, parsed.data.code);
  if (!valid) return NextResponse.json({ error: "Incorrect code" }, { status: 400 });

  const backupCodes = generateBackupCodes();
  const backupCodesHash = await Promise.all(backupCodes.map((code) => hashPassword(code)));

  await db.user.update({
    where: { id: user.id },
    data: {
      totpSecret: encryptSecret(secret),
      totpEnabled: true,
      totpBackupCodesHash: JSON.stringify(backupCodesHash),
    },
  });

  return NextResponse.json({ backupCodes: backupCodes.map(formatBackupCode) });
}
