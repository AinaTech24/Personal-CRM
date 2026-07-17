import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "aina_session";

const PUBLIC_PATHS = ["/login", "/invite"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * A cheap edge-side check: is this token signed, unexpired, and pointing at a
 * session at all? It deliberately cannot tell whether the session was revoked —
 * that needs the database, which Prisma can't reach from the edge runtime. So
 * this is only ever used to send *unauthenticated* traffic to /login. Deciding
 * that someone IS logged in is left to the pages, which can ask the database.
 * Treating a passing token here as proof of login is what caused a redirect
 * loop: the edge said yes, getCurrentUser() said no, and they bounced forever.
 */
async function hasValidSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    // Tokens minted before the Session table have no `sid` and can never resolve
    // to a live session, so they are dead weight — treat them as signed out.
    return typeof payload.sid === "string" && payload.sid.length > 0;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/socket.io") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const authed = await hasValidSession(req);

  // /login never redirects from here. The login page itself checks the database
  // and sends genuinely-logged-in users to the dashboard. Bouncing them here on
  // the token alone would loop against any page that disagrees.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!authed) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    const res = NextResponse.redirect(loginUrl);
    // Drop the dead cookie so it stops being re-sent on every request.
    if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
