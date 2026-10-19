import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";

/** How many attendance records are awaiting attention (checked in / pending approval). Drives the sidebar dot. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 403 });

  const scope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "ATTENDANCE", "READ");
  if (scope === null) return NextResponse.json({ count: 0 }, { status: 403 });

  const count = await db.attendance.count({
    where: { approvalStatus: "PENDING", ...(scope === "all" ? {} : { user: { departmentId: scope.departmentId } }) },
  });
  return NextResponse.json({ count });
}
