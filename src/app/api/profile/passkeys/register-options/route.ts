import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildRegistrationOptions, rpConfigFromRequest, setWebauthnChallengeCookie } from "@/lib/webauthn";

/** Starts a passkey-registration ceremony for the already-logged-in user. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const { rpID } = rpConfigFromRequest(req);
  const options = await buildRegistrationOptions({
    rpID,
    userId: user.id,
    email: user.email,
    displayName: user.name,
    excludeCredentials: existing,
  });

  await setWebauthnChallengeCookie(options.challenge);
  return NextResponse.json({ options });
}
