import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { attendanceAccessScope } from "@/lib/attendance-query";

/** How many attendance records are awaiting attention (checked in / pending approval). Drives the sidebar dot. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 403 });

  const scope = await attendanceAccessScope(user, "READ");
  if (scope === null) return NextResponse.json({ count: 0 }, { status: 403 });

  const count = await db.attendance.count({
    where: { approvalStatus: "PENDING", ...(scope === "all" ? {} : { user: { departmentId: scope.departmentId } }) },
  });
  return NextResponse.json({ count });
}
