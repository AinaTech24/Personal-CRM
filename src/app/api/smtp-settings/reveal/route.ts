import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { decryptSecret } from "@/lib/crypto";

const SETTINGS_ID = "default";

/** The only route that ever returns the SMTP password to the client — GET /api/smtp-settings never selects it. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await db.smtpSettings.findUnique({ where: { id: SETTINGS_ID }, select: { password: true } });
  if (!settings?.password) return NextResponse.json({ error: "No password set" }, { status: 404 });

  return NextResponse.json({ password: decryptSecret(settings.password) });
}
