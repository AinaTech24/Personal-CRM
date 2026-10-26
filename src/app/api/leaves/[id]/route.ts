import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { attendanceAccessScope } from "@/lib/attendance-query";

/** Admin (anyone), a Department Admin (their own department), or an Attendance module grant: cancel a leave entry. The attendance record it stamped is left alone. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await attendanceAccessScope(user, "DELETE");
  if (scope === null) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.userLeave.findUnique({ where: { id }, select: { id: true, userId: true, user: { select: { departmentId: true } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scope !== "all" && existing.user.departmentId !== scope.departmentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.userLeave.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
