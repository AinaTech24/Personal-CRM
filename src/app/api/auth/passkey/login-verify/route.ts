import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";
import {
  consumeWebauthnChallengeCookie,
  decodePublicKey,
  decodeUserHandle,
  finishAuthentication,
  rpConfigFromRequest,
} from "@/lib/webauthn";

const LIMIT = 15;
const WINDOW_MS = 5 * 60 * 1000;

const bodySchema = z.object({ response: z.record(z.string(), z.any()) });

/** Finishes a passkey login — proving possession of the credential is treated as satisfying login on its own, no TOTP step. */
export async function POST(req: NextRequest) {
  const ip = requestDevice(req).ip ?? "unknown";
  const { allowed, retryAfterSeconds } = rateLimit(`passkey-login-verify:${ip}`, LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid passkey response" }, { status: 400 });
  const response = parsed.data.response as Parameters<typeof finishAuthentication>[0]["response"];

  const expectedChallenge = await consumeWebauthnChallengeCookie();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "This sign-in attempt expired. Try the passkey again." }, { status: 400 });
  }

  const userHandle = response.response.userHandle;
  if (!userHandle) {
    return NextResponse.json({ error: "That passkey isn't recognized." }, { status: 401 });
  }

  const userId = decodeUserHandle(userHandle);
  const passkey = await db.passkey.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });

  if (!passkey || passkey.userId !== userId || !passkey.user.isActive) {
    return NextResponse.json({ error: "That passkey isn't recognized." }, { status: 401 });
  }

  const { rpID, origin } = rpConfigFromRequest(req);

  let verification;
  try {
    verification = await finishAuthentication({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: decodePublicKey(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports ? passkey.transports.split(",") : undefined,
      },
    });
  } catch (err) {
    console.error("[api/auth/passkey/login-verify] failed:", err);
    return NextResponse.json({ error: "Couldn't verify that passkey." }, { status: 401 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Couldn't verify that passkey." }, { status: 401 });
  }

  const user = passkey.user;
  await db.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });

  await createSessionCookie(
    { userId: user.id, email: user.email, role: user.role, departmentId: user.departmentId },
    req,
    "passkey"
  );

  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}
