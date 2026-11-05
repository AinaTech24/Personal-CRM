import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { formatBackupCode, generateBackupCodes } from "@/lib/totp";

const bodySchema = z.object({ password: z.string().min(1) });

/** Invalidates the old backup codes and issues a fresh set of 8. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.totpEnabled) {
    return NextResponse.json({ error: "Two-factor authentication isn't enabled." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your password" }, { status: 400 });

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  const backupCodes = generateBackupCodes();
  const backupCodesHash = await Promise.all(backupCodes.map((code) => hashPassword(code)));

  await db.user.update({ where: { id: user.id }, data: { totpBackupCodesHash: JSON.stringify(backupCodesHash) } });

  return NextResponse.json({ backupCodes: backupCodes.map(formatBackupCode) });
}
