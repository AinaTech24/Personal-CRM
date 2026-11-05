import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type Uint8Array_,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getSecret } from "@/lib/auth";

const RP_NAME = "Aina CRM";
const CHALLENGE_COOKIE = "aina_webauthn_challenge";
const CHALLENGE_TTL_SECONDS = 120;

interface ChallengePayload {
  challenge: string;
}

/**
 * The RP ID / expected origin are derived from the request rather than a
 * fixed env var, so passkeys keep working whether the app is reached via its
 * production domain or localhost in dev, with no extra config either way.
 */
export function rpConfigFromRequest(req: NextRequest): { rpID: string; origin: string } {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return { rpID: new URL(origin).hostname, origin };
    } catch {
      // fall through to the Host-header reconstruction below
    }
  }
  const host = req.headers.get("host") ?? "localhost";
  const proto = req.headers.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

export async function setWebauthnChallengeCookie(challenge: string) {
  const token = await new SignJWT({ challenge } satisfies ChallengePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
    .sign(getSecret());
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

/** Reads and clears the challenge cookie in one call — each ceremony's challenge is single-use. */
export async function consumeWebauthnChallengeCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CHALLENGE_COOKIE)?.value;
  cookieStore.delete(CHALLENGE_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload as unknown as ChallengePayload).challenge;
  } catch {
    return null;
  }
}

export async function buildRegistrationOptions(opts: {
  rpID: string;
  userId: string;
  email: string;
  displayName: string;
  excludeCredentials: { credentialId: string; transports: string | null }[];
}) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: opts.rpID,
    userName: opts.email,
    userDisplayName: opts.displayName,
    // The account's own id, echoed back as `userHandle` on every later
    // authentication — that's how login-verify maps a passkey back to a
    // User without the login page ever asking for an email first.
    userID: new TextEncoder().encode(opts.userId),
    attestationType: "none",
    excludeCredentials: opts.excludeCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? c.transports.split(",") : undefined,
    })),
    // residentKey "required" (not just "preferred") so every passkey this app
    // creates is discoverable — login works without typing an email first.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

export async function buildAuthenticationOptions(opts: { rpID: string }) {
  return generateAuthenticationOptions({
    rpID: opts.rpID,
    userVerification: "preferred",
    // No allowCredentials: the browser surfaces every discoverable passkey
    // for this rpID itself (usernameless/"Sign in with a passkey" flow).
  });
}

export async function finishRegistration(opts: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
}) {
  return verifyRegistrationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.expectedOrigin,
    expectedRPID: opts.expectedRPID,
  });
}

export async function finishAuthentication(opts: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: WebAuthnCredential;
}) {
  return verifyAuthenticationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.expectedOrigin,
    expectedRPID: opts.expectedRPID,
    credential: opts.credential,
  });
}

export function encodePublicKey(publicKey: Uint8Array_) {
  return isoBase64URL.fromBuffer(publicKey);
}

export function decodePublicKey(stored: string) {
  return isoBase64URL.toBuffer(stored);
}

/** Recovers the User.id that registration stamped into `userID` from an authentication response's base64url userHandle. */
export function decodeUserHandle(userHandle: string) {
  return new TextDecoder().decode(isoBase64URL.toBuffer(userHandle));
}
