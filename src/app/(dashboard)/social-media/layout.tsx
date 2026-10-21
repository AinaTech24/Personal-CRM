import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, hasSocialMediaAccess } from "@/lib/social-media";
import { canManageModule } from "@/lib/module-permissions-store";

/**
 * Server-side gate for every /social-media/* page (the list, a client's own
 * detail view, and the team console) — mirrors /admin/layout.tsx's reasoning
 * exactly: the APIs behind these pages already return 403/404 for anyone who
 * shouldn't be here, so this isn't what keeps the data safe, but without it
 * any signed-in user (any department, any role) could open the page shell
 * itself and see broken/empty state instead of being sent away entirely.
 *
 * Same OR as /clients/page.tsx (the generic entry point into this same
 * client list for someone without Social Media team access): a CLIENTS
 * module grant alone is enough to open this shell too, since a client's own
 * detail view (/social-media/[id]) is reached from there. Without this,
 * clicking a client card sent a CLIENTS-grant holder straight back to "/" —
 * the list rendered fine (it already had both checks), only the detail
 * page's own gate didn't.
 *
 * This is the floor, not the ceiling — the team console (/social-media/team)
 * needs the stricter "lead or admin" check on top of this, done in its own
 * page.tsx, since a regular (non-lead) team member has this broader access
 * but not that one.
 */
export default async function SocialMediaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getSocialMembership(user.id);
  if (!hasSocialMediaAccess(user, membership) && !(await canManageModule(user, "CLIENTS", "READ"))) redirect("/");

  return <>{children}</>;
}
