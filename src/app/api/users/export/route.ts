import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { csvRow, csvResponse } from "@/lib/csv";
import { istDateKey } from "@/lib/attendance";

/** Admin-only: CSV export of every user, same data as the Admin > Users list. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
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
