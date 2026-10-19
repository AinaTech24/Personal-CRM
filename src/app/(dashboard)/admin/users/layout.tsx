import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";

/**
 * Users & Invites isn't one of the module permissions a non-admin grant can
 * unlock (see the parent admin/layout.tsx) — it manages roles, departments,
 * and every other module's grants, so creating/inviting, role/department
 * changes, and deletion stay company-admin only. A Department Admin still
 * gets in, scoped to viewing and editing (designation, date of joining,
 * block/unblock, PIN) people in their own department — see
 * /api/users/route.ts and /api/users/[id]/route.ts for where that scoping
 * actually lives.
 */
export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !isDepartmentAdmin(user))) redirect("/");
  return <>{children}</>;
}
