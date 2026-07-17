import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

/**
 * Server-side gate for every /admin page. The APIs behind them already return
 * 403, so this isn't what keeps the data safe — but without it any signed-in
 * user could open the pages and see the admin UI sitting there empty, which
 * reads as broken and advertises what they can't have. The sidebar hides these
 * links for non-admins; hiding a link isn't access control.
 *
 * This is a floor, not a ceiling: pages needing more (Departments is super
 * admin only) still enforce that in their own API.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");
  return <>{children}</>;
}
