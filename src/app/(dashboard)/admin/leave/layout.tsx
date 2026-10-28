import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";

/** Open to a company admin, or a Department Admin individually granted the Leave module — never a plain Department User, regardless of any grant. */
export default async function AdminLeaveLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !(isDepartmentAdmin(user) && (await canManageModule(user, "LEAVE", "READ")))) redirect("/");
  return <>{children}</>;
}
