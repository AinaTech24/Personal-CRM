import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";

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

  return (
    <div className="flex min-h-full flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}
          {admin ? " — live overview across all modules" : ""}
        </p>
      </div>

      {admin ? (
        <DashboardStats />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link key={m.href} href={m.href}>
              <Card className="p-4 transition-colors hover:border-primary/40">
                <CardHeader className="p-0">
                  <CardTitle className="text-base">{m.name}</CardTitle>
                  <CardDescription>{m.description}</CardDescription>
                </CardHeader>
                <CardContent className="p-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
