import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCrmMembership, hasCrmAccess } from "@/lib/crm-team";
import { CallsView } from "@/components/calls/calls-view";

/**
 * Server-side gate, same reasoning as /clients for Social Media — the Calls
 * module is CRM Team-specific, so anyone without CRM access at all (no
 * membership, not a company admin) is sent home before this page's call
 * log ever reaches them.
 */
export default async function CallsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCrmMembership(user.id);
  if (!hasCrmAccess(user, membership)) redirect("/");

  return <CallsView />;
}
