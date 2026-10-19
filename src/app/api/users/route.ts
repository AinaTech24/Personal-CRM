import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";

/**
 * A company Admin sees and manages everyone; a Department Admin sees and
 * can edit (a restricted set of fields — see PATCH /api/users/[id]) people
 * in their own department only. `viewerIsAdmin` tells the client whether to
 * show admin-only actions (invite, role/department changes, delete).
 */
export async function GET() {
  const user = await getCurrentUser();
  const admin = !!user && isAdmin(user);
  const deptAdmin = !!user && !admin && isDepartmentAdmin(user);
  if (!user || (!admin && !deptAdmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    where: deptAdmin ? { departmentId: user.departmentId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      department: true,
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

  return NextResponse.json({ users, viewerIsAdmin: admin });
}
