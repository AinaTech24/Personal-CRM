import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { csvRow, csvResponse } from "@/lib/csv";
import { istDateKey } from "@/lib/attendance";
import { slugify } from "@/lib/slug";

/** Same access as the department detail GET: a company Admin for any department, or a Department Admin for their own. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isAdmin(user) && !(isDepartmentAdmin(user) && user.departmentId === id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const department = await db.department.findUnique({
    where: { id },
    include: {
      users: {
        select: { name: true, surname: true, email: true, mobile: true, role: true, isDepartmentAdmin: true, isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!department) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines: string[] = [
    csvRow(["Name", "Email", "Mobile", "Role", "Department Admin", "Status"]),
    ...department.users.map((u) =>
      csvRow([
        [u.name, u.surname].filter(Boolean).join(" "),
        u.email,
        u.mobile ?? "",
        u.role.replace(/_/g, " "),
        u.isDepartmentAdmin ? "Yes" : "No",
        u.isActive ? "Active" : "Blocked",
      ])
    ),
  ];

  return csvResponse(lines, `${slugify(department.name)}-members-${istDateKey()}.csv`);
}
