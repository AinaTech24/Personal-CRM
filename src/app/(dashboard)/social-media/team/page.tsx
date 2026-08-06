import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, isSocialMediaLead } from "@/lib/social-media";
import { SocialMediaTeamConsole } from "@/components/social-media/team-console";

/**
 * Stricter than the /social-media layout above it: any team member can pass
 * that gate, but managing membership/attendance/activity for the whole team
 * is lead/admin-only. Checked here, server-side, before any of the console's
 * markup ever reaches the client — a regular member hitting this URL is sent
 * home outright rather than shown a page that then reports "no access".
 */
export default async function SocialMediaTeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getSocialMembership(user.id);
  if (!isSocialMediaLead(user, membership)) redirect("/");

  return <SocialMediaTeamConsole />;
}
