import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { hasAnyModulePermission } from "@/lib/module-permissions-store";

/**
 * Server-side gate for every /admin page — a floor, not a ceiling. It only
 * requires company-admin OR *some* individually-granted module permission
 * (Leave/Attendance/Birthdays are the only grants with a page under here;
 * everything else lives at its own top-level route). Each page below that
 * isn't one of those three still enforces full isAdmin itself, in its own
 * nested layout — see admin/users/layout.tsx and its siblings — since this
 * outer check alone would otherwise let any module-grant holder load their
 * empty shells. The APIs behind every page are independently gated too; this
 * is purely about not showing broken-looking admin UI to someone who can't
 * use it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !(await hasAnyModulePermission(user.id))) redirect("/");
  return <>{children}</>;
}
