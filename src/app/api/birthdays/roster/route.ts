import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";

/**
 * The roster for the Birthdays admin console: everyone active, with their
 * saved birthday — narrower than /api/users (no email, mobile, or role) so a
 * Birthdays-only module grant doesn't need the full Users list, which stays
 * admin-only, to manage just this one module.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(await canManageModule(user, "BIRTHDAYS", "READ")))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      surname: true,
      avatarDataUrl: true,
      isActive: true,
      birthday: true,
      department: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
