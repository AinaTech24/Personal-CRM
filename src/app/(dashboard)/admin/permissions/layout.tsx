import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";

/** Open to a company Admin, or a Department Admin managing their own department's users. */
export default async function AdminPermissionsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!isAdmin(user) && !isDepartmentAdmin(user)) redirect("/");
  return <>{children}</>;
}
