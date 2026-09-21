import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessClientsModule } from "@/lib/permissions";
import { AccountsView } from "@/components/accounts/accounts-view";

/**
 * Server-side gate: this module is off for most departments by default
 * (Department.hasClientsModule) and only ever on for an Admin/Super Admin,
 * an Analyst, or a department an admin has explicitly opted in via the
 * Departments admin page.
 */
export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessClientsModule(user)) redirect("/");

  return <AccountsView />;
}
