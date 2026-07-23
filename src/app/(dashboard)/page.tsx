import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { UserDashboard } from "@/components/dashboard/user-dashboard";

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
        <DashboardStats greetingName={user?.name.split(" ")[0] ?? ""} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <UserDashboard firstName={user?.name.split(" ")[0] ?? "there"} />
    </div>
  );
}
