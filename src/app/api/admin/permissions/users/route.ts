import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";

/** Everyone the current viewer may open the Permission Manager for: every active user for a company Admin, or everyone else in their own department for a Department Admin. Never includes the viewer themselves. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user) && !isDepartmentAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await db.user.findMany({
    where: {
      isActive: true,
      NOT: { id: user.id },
      ...(isAdmin(user) ? {} : { departmentId: user.departmentId }),
    },
    select: { id: true, name: true, surname: true, email: true, departmentId: true, department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
