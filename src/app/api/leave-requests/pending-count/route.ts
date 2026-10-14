import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(await canManageModule(user, "LEAVE")))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const count = await db.leaveRequest.count({ where: { status: "PENDING" } });
  return NextResponse.json({ count });
}
