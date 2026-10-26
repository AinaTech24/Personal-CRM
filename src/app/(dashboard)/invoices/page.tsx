import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isRestrictedFromModule } from "@/lib/social-media";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { InvoicesList } from "@/components/billing/invoices-list";

/**
 * Server-side gate, same pattern as quotations/page.tsx: the API routes are
 * what actually keep the data safe, but without this a restricted or
 * hidden-module member could still open the page and see an empty/broken UI
 * sitting there.
 */
export default async function InvoicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isRestrictedFromModule(user)) redirect("/");
  if (await isUngrantedModuleHidden(user, "invoices")) redirect("/");

  return <InvoicesList />;
}
