import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { isMember } from "@/lib/chat";

/**
 * Internal only — called by server.js, which runs the socket.io server in
 * this same process, so it can authenticate a socket handshake (and later,
 * individual room-join requests) by forwarding the client's cookie header
 * here and reusing the real session/DB logic rather than duplicating it
 * outside the Next.js request runtime. Gated by CRON_SECRET, the same way
 * the reminder-sweep routes restrict themselves to same-process callers —
 * nothing external should ever be able to reach this.
 */
function authorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    role: user.role,
    departmentId: user.departmentId,
    isAdmin: isAdmin(user),
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const conversationId = body && typeof body === "object" ? (body as Record<string, unknown>).conversationId : null;
  if (typeof conversationId !== "string" || !conversationId) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const member = await isMember(user.id, conversationId);
  return NextResponse.json({ member });
}
