import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { hasAnyModulePermission } from "@/lib/module-permissions-store";

/**
 * Server-side gate for every /admin page — a floor, not a ceiling. It only
 * requires company-admin, a Department Admin (for the Permission Manager),
 * or *some* individually-granted module permission (Leave/Attendance/
 * Birthdays are the only grants with a page under here; everything else
 * lives at its own top-level route). Each page below that isn't one of
 * those four still enforces its own stricter check in its own nested
 * layout — see admin/users/layout.tsx and its siblings — since this outer
 * check alone would otherwise let any of them load the others' empty
 * shells. The APIs behind every page are independently gated too; this is
 * purely about not showing broken-looking admin UI to someone who can't
 * use it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !isDepartmentAdmin(user) && !(await hasAnyModulePermission(user.id))) redirect("/");
  return <>{children}</>;
}
