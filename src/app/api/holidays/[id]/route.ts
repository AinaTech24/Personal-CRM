import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";

/** Admin, or a Department Admin holding an Attendance module grant, removes a holiday. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(isDepartmentAdmin(user) && (await canManageModule(user, "ATTENDANCE", "DELETE"))))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await db.holiday.deleteMany({ where: { id } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
