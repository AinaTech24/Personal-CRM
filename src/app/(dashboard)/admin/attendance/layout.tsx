import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";

/**
 * Open to a company admin or a Department Admin (their own department)
 * only — a plain Permission Manager grant no longer reaches this page by
 * itself. That grant still works for the Team console's own attendance
 * approve/edit flow (see attendance-query.ts's attendanceAccessScope); this
 * is specifically the Administration page.
 */
export default async function AdminAttendanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !isDepartmentAdmin(user)) redirect("/");
  return <>{children}</>;
}
