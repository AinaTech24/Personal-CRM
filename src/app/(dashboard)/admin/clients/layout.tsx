import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

/**
 * This is the admin-wide Client Accounts console, not the one a Clients
 * module grant unlocks — that one lives at the top-level /clients route
 * (shared with Social Media team members), so this page stays company-admin
 * only (see the parent admin/layout.tsx).
 */
export default async function AdminClientsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");
  return <>{children}</>;
}
