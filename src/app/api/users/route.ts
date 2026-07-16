import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { department: true },
    omit: { passwordHash: true },
  });

  return NextResponse.json({ users });
}
