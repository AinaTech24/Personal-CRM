import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { getModuleGrantees } from "@/lib/module-permissions-store";
import { MANAGED_MODULES, type ManagedModule } from "@/lib/module-permissions";

/**
 * Everyone holding a grant on one module — the reverse of the per-person
 * matrix, for the Permission Manager's "By module" view. Same audience as
 * the per-person view: a company Admin sees everyone, a Department Admin
 * only people in their own department.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ module: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user) && !isDepartmentAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { module: moduleParam } = await params;
  if (!MANAGED_MODULES.includes(moduleParam as ManagedModule)) {
    return NextResponse.json({ error: "Unknown module" }, { status: 400 });
  }
  const moduleKey = moduleParam as ManagedModule;

  const grantees = await getModuleGrantees(moduleKey);
  const users = await db.user.findMany({
    where: {
      id: { in: grantees.map((g) => g.userId) },
      ...(isAdmin(user) ? {} : { departmentId: user.departmentId }),
    },
    select: { id: true, name: true, surname: true, email: true, department: { select: { name: true } } },
  });

  const byId = new Map(users.map((u) => [u.id, u]));
  const rows = grantees
    .filter((g) => byId.has(g.userId))
    .map((g) => ({ ...byId.get(g.userId)!, flags: g.flags }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ module: moduleKey, grantees: rows });
}
