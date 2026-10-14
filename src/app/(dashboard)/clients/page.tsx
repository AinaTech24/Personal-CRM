import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, hasSocialMediaAccess } from "@/lib/social-media";
import { canManageModule } from "@/lib/module-permissions-store";
import { ClientsPageClient } from "@/components/social-media/clients-page";

/**
 * Server-side gate, same reasoning as the /social-media layout — this is a
 * separate top-level route (not nested under /social-media), so it needs its
 * own check rather than inheriting that layout's. Anyone without Social
 * Media access at all (no membership, not a company admin) is sent home
 * before this page's markup — including its client list, names, and
 * stages — ever reaches them.
 */
export default async function ClientsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getSocialMembership(user.id);
  if (!hasSocialMediaAccess(user, membership) && !(await canManageModule(user, "CLIENTS"))) redirect("/");

  return <ClientsPageClient />;
}
