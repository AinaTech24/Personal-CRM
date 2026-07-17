import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentSessionId } from "@/lib/auth";

/** "Sign out everywhere else" — revokes every session except the one making this request. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentSessionId = await getCurrentSessionId();
  const result = await db.session.updateMany({
    where: { userId: user.id, revokedAt: null, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ revoked: result.count });
}
