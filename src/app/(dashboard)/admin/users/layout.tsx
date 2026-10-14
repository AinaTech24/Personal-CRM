import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

/**
 * Users & Invites isn't one of the module permissions a non-admin grant can
 * unlock (see the parent admin/layout.tsx) — it manages roles, departments,
 * and every other module's grants, so it stays company-admin only.
 */
export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");
  return <>{children}</>;
}
