import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { csvRow, csvResponse } from "@/lib/csv";
import { istDateKey } from "@/lib/attendance";

/** Admin: CSV export of every user. Department Admin: just their own department's — same scope as the Admin > Users list. */
export async function GET() {
  const user = await getCurrentUser();
  const admin = !!user && isAdmin(user);
  const deptAdmin = !!user && !admin && isDepartmentAdmin(user);
  if (!user || (!admin && !deptAdmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    where: deptAdmin ? { departmentId: user.departmentId } : undefined,
    orderBy: { name: "asc" },
    include: { department: true },
  });

  const lines: string[] = [
    csvRow(["Name", "Email", "Mobile", "Role", "Department", "Designation", "Department Admin", "Status", "Joined", "Date of Joining"]),
    ...users.map((u) =>
      csvRow([
        [u.name, u.surname].filter(Boolean).join(" "),
        u.email,
        u.mobile ?? "",
        u.role.replace(/_/g, " "),
        u.department?.name ?? "",
        u.designation ?? "",
        u.isDepartmentAdmin ? "Yes" : "No",
        u.isActive ? "Active" : "Blocked",
        u.createdAt.toISOString().slice(0, 10),
        u.dateOfJoining ? u.dateOfJoining.toISOString().slice(0, 10) : "",
      ])
    ),
  ];

  return csvResponse(lines, `users-${istDateKey()}.csv`);
}
