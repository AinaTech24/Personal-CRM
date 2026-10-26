import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";

/** Open to a company admin, or anyone individually granted the Expenses module. */
export default async function AdminExpensesLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !(await canManageModule(user, "EXPENSES", "READ"))) redirect("/");
  return <>{children}</>;
}
