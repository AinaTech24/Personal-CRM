import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";

/** Admin (or an Attendance module grant): cancel a leave entry. The attendance record it stamped is left alone. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(await canManageModule(user, "ATTENDANCE", "DELETE")))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.userLeave.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.userLeave.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
