"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GenericTeamConsole } from "@/components/teams/team-console";
import { IconChevronLeft } from "@/components/icons";
import { PageLoader } from "@/components/ui/page-loader";

/** Social Media and CRM keep their own dedicated consoles — reached directly if someone links here anyway. */
const SYSTEM_TEAM_HREF: Record<string, string> = {
  "social-media": "/social-media/team",
  crm: "/crm/team",
};

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [slug, setSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/teams/${params.id}`)
      .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) return setLoadError(data.error ?? "Couldn't load this team");
        setSlug(data.team.slug);
      });
    return () => {
      active = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (!slug) return;
    const systemHref = SYSTEM_TEAM_HREF[slug];
    if (systemHref) router.replace(systemHref);
  }, [slug, router]);

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" className="w-fit" onClick={() => router.push("/teams")}>
          Back to teams
        </Button>
      </div>
    );
  }

  if (!slug || SYSTEM_TEAM_HREF[slug]) {
    return <PageLoader />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="icon" className="w-fit" onClick={() => router.push("/teams")} aria-label="Back to teams">
        <IconChevronLeft className="h-4 w-4" />
      </Button>
      <GenericTeamConsole teamId={params.id} />
    </div>
  );
}
