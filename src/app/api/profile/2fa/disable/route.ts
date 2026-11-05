import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, verifyPassword } from "@/lib/auth";

const bodySchema = z.object({ password: z.string().min(1) });

/** Turns 2FA off, re-confirming the password since this lowers the account's login bar. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your password" }, { status: 400 });

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  await db.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodesHash: null },
  });

  return NextResponse.json({ ok: true });
}
