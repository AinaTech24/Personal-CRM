import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  consumeWebauthnChallengeCookie,
  encodePublicKey,
  finishRegistration,
  rpConfigFromRequest,
} from "@/lib/webauthn";

const bodySchema = z.object({
  response: z.record(z.string(), z.any()),
  name: z.string().trim().max(60).optional(),
});

/** Verifies the browser's attestation response and saves the new passkey. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const expectedChallenge = await consumeWebauthnChallengeCookie();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "This setup attempt expired. Try adding the passkey again." }, { status: 400 });
  }

  const { rpID, origin } = rpConfigFromRequest(req);

  let verification;
  try {
    verification = await finishRegistration({
      response: parsed.data.response as Parameters<typeof finishRegistration>[0]["response"],
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    console.error("[api/profile/passkeys/register-verify] failed:", err);
    return NextResponse.json({ error: "Couldn't verify that passkey. Try again." }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Couldn't verify that passkey. Try again." }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await db.passkey.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: encodePublicKey(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports?.length ? credential.transports.join(",") : null,
      name: parsed.data.name || null,
    },
  });

  return NextResponse.json({ ok: true });
}
