import { NextRequest, NextResponse } from "next/server";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";
import { buildAuthenticationOptions, rpConfigFromRequest, setWebauthnChallengeCookie } from "@/lib/webauthn";

const LIMIT = 15;
const WINDOW_MS = 5 * 60 * 1000;

/** Starts a usernameless passkey-login ceremony — no email needed, the browser's own passkey picker identifies the account. */
export async function POST(req: NextRequest) {
  const ip = requestDevice(req).ip ?? "unknown";
  const { allowed, retryAfterSeconds } = rateLimit(`passkey-login-options:${ip}`, LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const { rpID } = rpConfigFromRequest(req);
  const options = await buildAuthenticationOptions({ rpID });
  await setWebauthnChallengeCookie(options.challenge);
  return NextResponse.json({ options });
}
