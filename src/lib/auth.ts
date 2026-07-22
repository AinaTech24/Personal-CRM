import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { setActor } from "@/lib/audit";

const SESSION_COOKIE = "aina_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000; // only bump lastSeenAt at most every 5 minutes

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: Role;
  departmentId: string | null;
}

/** The decoded JWT also carries `sid` — the Session row id — used for server-side revocation. */
interface SessionTokenPayload extends SessionPayload {
  sid: string;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function isAinatechEmail(email: string) {
  return email.toLowerCase().trim().endsWith("@ainatech.in");
}

/** Public email providers that admins can optionally allow inviting (see SmtpSettings.allowExternalInvites). */
export const PUBLIC_INVITE_DOMAINS = ["gmail.com", "outlook.com", "icloud.com", "yahoo.com"];

/**
 * Whether an email may be invited: @ainatech.in is always allowed; the public
 * providers are allowed only when the admin has turned on external invites.
 */
export function isAllowedInviteEmail(email: string, allowExternal: boolean) {
  if (isAinatechEmail(email)) return true;
  if (!allowExternal) return false;
  const domain = email.toLowerCase().trim().split("@")[1] ?? "";
  return PUBLIC_INVITE_DOMAINS.includes(domain);
}

async function signSessionToken(payload: SessionTokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionTokenPayload;
  } catch {
    return null;
  }
}

function deviceInfoFrom(req?: NextRequest) {
  if (!req) return { userAgent: null, ip: null };
  const userAgent = req.headers.get("user-agent");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { userAgent, ip };
}

/**
 * Creates a Session row (the revocable record) and an httpOnly JWT cookie whose
 * `sid` claim points at it. Pass the originating request so the session can be
 * labeled with a device/IP in the Security settings list.
 */
export async function createSessionCookie(payload: SessionPayload, req?: NextRequest) {
  const { userAgent, ip } = deviceInfoFrom(req);
  const session = await db.session.create({
    data: { userId: payload.userId, userAgent, ip },
  });

  const token = await signSessionToken({ ...payload, sid: session.id });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return session;
}

/** Clears the cookie and revokes the underlying Session row so the token is dead even if it leaked. */
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  cookieStore.delete(SESSION_COOKIE);
  if (!token) return;
  const decoded = await verifySessionToken(token);
  if (decoded?.sid) {
    await db.session.updateMany({ where: { id: decoded.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}

/** Verifies the cookie's JWT, then confirms its Session row is still live (not revoked). */
export async function getSessionFromCookies(): Promise<SessionTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const decoded = await verifySessionToken(token);
  // A token minted before Session rows existed has no `sid`. Treat it as signed
  // out rather than querying on `id: undefined`, which Prisma rejects — that
  // would 500 every already-logged-in user on the deploy that ships this.
  if (!decoded?.sid) return null;

  const session = await db.session.findUnique({ where: { id: decoded.sid } });
  if (!session || session.revokedAt) return null;

  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  return decoded;
}

export { SESSION_COOKIE };

export async function getCurrentUser() {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { department: true },
  });

  if (!user || !user.isActive) return null;
  // Tag the rest of this request so the audit extension knows who is acting.
  setActor({ id: user.id, name: [user.name, user.surname].filter(Boolean).join(" ") });
  return user;
}

/** The Session row id (`sid`) backing the current request's cookie, if any — used to mark "this device." */
export async function getCurrentSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const decoded = await verifySessionToken(token);
  return decoded?.sid ?? null;
}
