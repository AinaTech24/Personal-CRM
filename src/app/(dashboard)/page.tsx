import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { getSocialMembership, isSocialMediaLead } from "@/lib/social-media";
import { LANDING_PAGE_HREFS } from "@/lib/modules";
import { BirthdayBanner } from "@/components/birthdays/birthday-banner";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { TodayTimeline } from "@/components/dashboard/today-timeline";
import { ClientPipeline } from "@/components/social-media/client-pipeline";

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  // Only redirect to a known module route — LANDING_PAGE_HREFS (modules.ts)
  // is the full set the Settings picker can ever save, so trusting an exact
  // match against it is safe. Trusting the stored string directly would let
  // a stale or hand-written value send users off-site, or loop if it pointed
  // here. A value the picker offered when saved but this person has since
  // lost access to (a grant revoked, a module hidden) still matches here and
  // redirects same as ever — the destination page's own access check is what
  // actually enforces that, same as a sidebar link to a now-inaccessible page
  // would.
  if (user?.defaultLandingPage && LANDING_PAGE_HREFS.includes(user.defaultLandingPage)) {
    redirect(user.defaultLandingPage);
  }
  const admin = user ? isAdmin(user) : false;

  // Admins keep the cross-module overview; everyone else gets their own day.
  if (admin) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <BirthdayBanner />
        <DashboardStats />
        <TodayTimeline />
        <div>
          <h2 className="text-lg font-semibold">Social Media pipeline</h2>
          <p className="mb-3 text-sm text-muted-foreground">Every client with content in flight, and where each piece stands.</p>
          <ClientPipeline />
        </div>
      </div>
    );
  }

  // A non-admin Social Media lead gets the same tracked-process pipeline at
  // the bottom of their own dashboard — otherwise it only ever surfaced on
  // a company Admin's dashboard or inside the Team console.
  const membership = user ? await getSocialMembership(user.id) : null;
  const socialLead = user ? isSocialMediaLead(user, membership) : false;
  // A Department Admin keeps their own personal dashboard, but also gets the
  // same company-admin-only timeline widget, scoped to their department —
  // the API enforces that scoping itself (see /api/dashboard/today-timeline).
  const deptAdmin = user ? isDepartmentAdmin(user) : false;

  return (
    <div className="flex min-h-full flex-col gap-6">
      <BirthdayBanner />
      <UserDashboard firstName={user?.name.split(" ")[0] ?? "there"} />
      {deptAdmin && <TodayTimeline />}
      {socialLead && (
        <div>
          <h2 className="text-lg font-semibold">Social Media pipeline</h2>
          <p className="mb-3 text-sm text-muted-foreground">Every client with content in flight, and where each piece stands.</p>
          <ClientPipeline />
        </div>
      )}
    </div>
  );
}
