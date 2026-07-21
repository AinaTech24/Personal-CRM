import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SearchProvider } from "@/components/providers/search-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <SocketProvider userId={user.id} departmentId={user.departmentId} isAdmin={isAdmin(user)}>
      <SearchProvider>
        <DashboardShell isAdmin={isAdmin(user)} userId={user.id} name={user.name} email={user.email}>
          {children}
        </DashboardShell>
      </SearchProvider>
    </SocketProvider>
  );
}
