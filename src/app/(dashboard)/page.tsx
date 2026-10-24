import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getSocialMembership, isSocialMediaLead } from "@/lib/social-media";
import { BirthdayBanner } from "@/components/birthdays/birthday-banner";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { ClientPipeline } from "@/components/social-media/client-pipeline";

const modules = [
  { name: "Leads", href: "/leads", description: "Track incoming business opportunities" },
  { name: "Tasks", href: "/tasks", description: "Centralized task tracking for teams" },
  { name: "Projects", href: "/projects", description: "Manage client and internal projects" },
  { name: "Quotations", href: "/quotations", description: "Generate and manage quotations" },
  { name: "Invoices", href: "/invoices", description: "Manage invoices and payments" },
];

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  // Only redirect to a known module route. Trusting the stored string would let a
  // stale or hand-written value send users off-site, or loop if it pointed here.
  const landing = modules.find((m) => m.href === user?.defaultLandingPage);
  if (landing) redirect(landing.href);
  const admin = user ? isAdmin(user) : false;

  // Admins keep the cross-module overview; everyone else gets their own day.
  if (admin) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <BirthdayBanner />
        <DashboardStats />
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

  return (
    <div className="flex min-h-full flex-col gap-6">
      <BirthdayBanner />
      <UserDashboard firstName={user?.name.split(" ")[0] ?? "there"} />
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
