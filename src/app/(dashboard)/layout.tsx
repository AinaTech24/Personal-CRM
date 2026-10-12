import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getSocialMembership, isSocialMediaLead, isSocialMediaOnlyUser } from "@/lib/social-media";
import { getCrmMembership, hasCrmAccess, isCrmLead } from "@/lib/crm-team";
import { canViewOnboardingSubmissions } from "@/lib/onboarding";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SearchProvider } from "@/components/providers/search-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Computed server-side, same as isAdmin, so the sidebar renders correctly
  // on first paint — still needed for the Quotations exclusion below, even
  // though Social Media itself no longer has a nav entry point at all.
  const membership = await getSocialMembership(user.id);
  const restrictToSocialMedia = isSocialMediaOnlyUser(user, membership);
  // A non-admin lead gets their own Team console link in the restricted nav
  // (see Sidebar); a regular team member doesn't manage the team, so they don't.
  const isTeamLead = isSocialMediaLead(user, membership) && restrictToSocialMedia;

  const crmMembership = await getCrmMembership(user.id);
  // Unlike Social Media, a company admin doesn't need this — they already
  // see the "CRM Team" admin nav link unconditionally — so this only ever
  // drives the Sidebar's non-admin "Calls"/"CRM Team" insertion.
  const crmAccess = !isAdmin(user) && hasCrmAccess(user, crmMembership);
  const crmTeamLead = crmAccess && isCrmLead(user, crmMembership);

  // Same gate as the page itself (src/app/(dashboard)/onboarding-submissions),
  // minus the admin half — an admin already sees this via adminNav.
  const canViewOnboarding = !isAdmin(user) && canViewOnboardingSubmissions(user);

  return (
    <SocketProvider userId={user.id} departmentId={user.departmentId} isAdmin={isAdmin(user)}>
      <SearchProvider>
        <DashboardShell
          isAdmin={isAdmin(user)}
          restrictToSocialMedia={restrictToSocialMedia}
          isSocialMediaLead={isTeamLead}
          hasCrmAccess={crmAccess}
          isCrmLead={crmTeamLead}
          canViewOnboarding={canViewOnboarding}
          userId={user.id}
          name={user.name}
          email={user.email}
        >
          {children}
        </DashboardShell>
      </SearchProvider>
    </SocketProvider>
  );
}
