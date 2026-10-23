import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "EXPENSES", "READ");
  if (scope === null) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const count = await db.expense.count({
    where: { status: "PENDING", ...(scope === "all" ? {} : { user: { departmentId: scope.departmentId } }) },
  });
  return NextResponse.json({ count });
}
