import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";

/**
 * Open to a company Admin (full CRUD over every department), or a
 * Department Admin (read-only list, plus their own department's detail
 * page to invite members into it — see admin/departments/[id]/page.tsx).
 */
export default async function AdminDepartmentsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !isDepartmentAdmin(user)) redirect("/");
  return <>{children}</>;
}
