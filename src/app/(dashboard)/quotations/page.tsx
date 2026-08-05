import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, isSocialMediaOnlyUser } from "@/lib/social-media";
import { QuotationsList } from "@/components/billing/quotations-list";

/**
 * Server-side gate, same pattern as admin/layout.tsx: the API routes are what
 * actually keeps the data safe (403 for a Social Media-only user), but
 * without this a member could still open the page and see an empty/broken
 * UI sitting there. Social Media team members (regular or lead, not a
 * company admin) don't get Quotations at all — see SOCIAL_MEDIA_EXCLUDED_HREFS
 * in sidebar.tsx.
 */
export default async function QuotationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getSocialMembership(user.id);
  if (isSocialMediaOnlyUser(user, membership)) redirect("/");

  return <QuotationsList />;
}
