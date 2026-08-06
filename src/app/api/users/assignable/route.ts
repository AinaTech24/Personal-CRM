import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assignableUsersFor } from "@/lib/leads";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?scope=all returns every active user (used by task assignment, where anyone
  // may be assigned regardless of department). Default stays department-scoped.
  const allActive = req.nextUrl.searchParams.get("scope") === "all";
  // ?minimal=1 skips avatarDataUrl for callers that only render a name/role
  // picker (no avatar thumbnails) — see assignableUsersFor's comment.
  const minimal = req.nextUrl.searchParams.get("minimal") === "1";
  const users = await assignableUsersFor(user, { allActive, minimal });
  return NextResponse.json({ users });
}
