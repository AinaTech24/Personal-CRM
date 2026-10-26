import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { PasswordManagerView } from "@/components/passwords/password-manager-view";

/** Server-side gate — the API routes are what actually keep the data safe, but without this a member of a company that's hidden this module would still open the page and see an empty/broken UI sitting there. */
export default async function PasswordsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isUngrantedModuleHidden(user, "passwords")) redirect("/");

  return <PasswordManagerView />;
}
