import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManageModule } from "@/lib/module-permissions-store";
import type { ConsultingAccess } from "@/components/consulting/types";

/**
 * Server-side gate for the Consulting pages: no READ grant (and not a
 * company admin) means a redirect home before any engagement data — client
 * firms, AUM, commercials — reaches the browser. Also returns the write
 * flags so the UI only offers actions the API will accept.
 */
export async function requireConsultingAccess(): Promise<ConsultingAccess> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManageModule(user, "CONSULTING", "READ"))) redirect("/");
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    canManageModule(user, "CONSULTING", "CREATE"),
    canManageModule(user, "CONSULTING", "UPDATE"),
    canManageModule(user, "CONSULTING", "DELETE"),
  ]);
  return { canCreate, canUpdate, canDelete };
}
