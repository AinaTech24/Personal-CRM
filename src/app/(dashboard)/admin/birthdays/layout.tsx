import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";

/** Open to a company admin, or anyone individually granted the Birthdays module. */
export default async function AdminBirthdaysLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !(await canManageModule(user, "BIRTHDAYS"))) redirect("/");
  return <>{children}</>;
}
