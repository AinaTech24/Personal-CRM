import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assignableUsersFor } from "@/lib/leads";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await assignableUsersFor(user);
  return NextResponse.json({ users });
}
