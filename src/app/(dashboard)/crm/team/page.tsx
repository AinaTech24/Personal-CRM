import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCrmMembership, isCrmLead } from "@/lib/crm-team";
import { CrmTeamConsole } from "@/components/crm/team-console";

/**
 * Stricter than a plain access check: any team member could theoretically
 * pass a broader gate, but managing membership/attendance/activity for the
 * whole team is lead/admin-only. Checked here, server-side, before any of
 * the console's markup ever reaches the client — mirrors
 * /social-media/team/page.tsx exactly.
 */
export default async function CrmTeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCrmMembership(user.id);
  if (!isCrmLead(user, membership)) redirect("/");

  return <CrmTeamConsole />;
}
