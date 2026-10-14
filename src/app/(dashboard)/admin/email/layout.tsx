import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

/** Not a module a non-admin grant can unlock (see the parent admin/layout.tsx) — stays company-admin only. */
export default async function AdminEmailLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");
  return <>{children}</>;
}
