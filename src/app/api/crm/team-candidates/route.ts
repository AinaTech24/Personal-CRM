import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCrmMembership, isCrmLead } from "@/lib/crm-team";

/**
 * A trimmed user picker for "add an existing user to the CRM team" —
 * deliberately not the full /api/users admin console, since a non-admin CRM
 * lead can reach this and shouldn't get the whole company's user-management
 * data just to pick a name.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, surname: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
