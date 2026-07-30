import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getSocialMembership, hasSocialMediaAccess } from "@/lib/social-media";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SearchProvider } from "@/components/providers/search-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Computed server-side, same as isAdmin, so the sidebar renders correctly
  // on first paint rather than showing/hiding the Social Media entry after a
  // client-side fetch resolves.
  const membership = await getSocialMembership(user.id);
  const socialMediaAccess = hasSocialMediaAccess(user, membership);

  return (
    <SocketProvider userId={user.id} departmentId={user.departmentId} isAdmin={isAdmin(user)}>
      <SearchProvider>
        <DashboardShell
          isAdmin={isAdmin(user)}
          hasSocialMediaAccess={socialMediaAccess}
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
