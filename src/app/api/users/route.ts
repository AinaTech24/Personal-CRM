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
    include: {
      department: true,
      socialMediaMembership: { select: { isLead: true } },
    },
    // Never ship secrets to the client — not the password hash, and not the
    // reset-code hash or its expiry, which the admin console would otherwise
    // surface as columns. Same for the PIN hash and its own reset code.
    omit: {
      passwordHash: true,
      resetCode: true,
      resetCodeExpiresAt: true,
      pinHash: true,
      pinResetCode: true,
      pinResetCodeExpiresAt: true,
    },
  });

  return NextResponse.json({ users });
}
