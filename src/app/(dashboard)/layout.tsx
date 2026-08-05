import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getSocialMembership, isSocialMediaOnlyUser } from "@/lib/social-media";
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

  return (
    <SocketProvider userId={user.id} departmentId={user.departmentId} isAdmin={isAdmin(user)}>
      <SearchProvider>
        <DashboardShell
          isAdmin={isAdmin(user)}
          restrictToSocialMedia={restrictToSocialMedia}
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
