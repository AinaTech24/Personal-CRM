import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership } from "@/lib/social-media";
import { isSocialMediaLead } from "@/lib/social-media-permissions";

/**
 * Per-client breakdown of every content item, ad campaign, and monthly
 * report — the "tracked process" view for the Social Media lead's own
 * dashboard/console and the company admin dashboard, both of which reuse
 * the same <ClientPipeline> component against this one response shape.
 * Lead-only (isSocialMediaLead already covers every company Admin/Super
 * Admin too — see social-media-permissions.ts): a regular team member sees
 * this same information already, one client at a time, on that client's own
 * Content/Ads/Monthly Reports tabs, so there's nothing this route would show
 * them that's actually new, and every client is included here regardless of
 * who created/is assigned to it, which a non-lead member isn't meant to see
 * in aggregate.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getSocialMembership(user.id);
  if (!isSocialMediaLead(user, membership)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clients = await db.socialClient.findMany({
    include: {
      contentItems: {
        where: { stage: { not: "CANCELLED" } },
        select: { id: true, type: true, title: true, stage: true, scheduledFor: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      },
      adCampaigns: {
        where: { stage: { not: "CANCELLED" } },
        select: { id: true, name: true, stage: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      },
      monthlyReports: {
        select: { id: true, year: true, month: true, title: true, reviewedAt: true, updatedAt: true },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  // Clients with nothing in flight right now add noise without adding
  // information — a lead scanning this for what's stuck doesn't need to
  // scroll past every fully-idle client to find them.
  const withActivity = clients
    .filter((c) => c.contentItems.length > 0 || c.adCampaigns.length > 0 || c.monthlyReports.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      companyName: c.companyName,
      contentItems: c.contentItems,
      adCampaigns: c.adCampaigns,
      monthlyReports: c.monthlyReports,
    }));

  return NextResponse.json({ clients: withActivity });
}
