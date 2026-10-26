import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, hasSocialMediaAccess, crmClientsScopeFor } from "@/lib/social-media";
import { canManageModule, isModuleBlocked, getHiddenModules } from "@/lib/module-permissions-store";
import { isAdmin } from "@/lib/permissions";
import { ClientsPageClient } from "@/components/social-media/clients-page";

/**
 * Server-side gate, same reasoning as the /social-media layout — this is a
 * separate top-level route (not nested under /social-media), so it needs its
 * own check rather than inheriting that layout's. Anyone without Social
 * Media access, a CLIENTS module grant, or CRM Team membership (read-only —
 * see crmClientsScopeFor) is sent home before this page's markup —
 * including its client list, names, and stages — ever reaches them. A
 * Permission Manager "block" overrides all three, even for a genuine Social
 * Media team member.
 */
export default async function ClientsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "CLIENTS")) redirect("/");

  const membership = await getSocialMembership(user.id);
  const genuineSocialMediaAccess = hasSocialMediaAccess(user, membership);

  // The company-wide "Sidebar modules" hide (Admin > Settings) only ever
  // suppresses the grant- and CRM-Team-based paths below — a genuine Social
  // Media team member keeps their own Clients view regardless of it.
  const hidden = !isAdmin(user) && !genuineSocialMediaAccess && (await getHiddenModules()).includes("clients");
  if (
    !genuineSocialMediaAccess &&
    (hidden || (!(await canManageModule(user, "CLIENTS", "READ")) && !(await crmClientsScopeFor(user))))
  ) {
    redirect("/");
  }

  return <ClientsPageClient />;
}
