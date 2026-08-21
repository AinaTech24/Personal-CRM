import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPasswordEntryForUser, logPasswordActivity } from "@/lib/passwords";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

/**
 * The only route that ever returns a decrypted password to the client — the
 * list and detail endpoints never select passwordCipher. A POST (not GET)
 * because it has a real side effect: every call is logged as a "revealed"
 * activity, so an entry's access history shows who looked at it and when.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getPasswordEntryForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entry = await db.passwordEntry.findUnique({ where: { id }, select: { passwordCipher: true } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let password: string;
  try {
    password = decryptSecret(entry.passwordCipher);
  } catch {
    const error = isEncryptionConfigured()
      ? "Couldn't decrypt this entry"
      : "Password Manager isn't fully set up yet — CREDENTIALS_ENCRYPTION_KEY is missing on the server. Ask an admin to add it and restart the app.";
    return NextResponse.json({ error }, { status: 500 });
  }

  await logPasswordActivity(id, user.id, "revealed");

  return NextResponse.json({ password });
}
