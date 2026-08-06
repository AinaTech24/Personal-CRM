"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconChevronDown, IconExternalLink } from "@/components/icons";
import { stageLabel } from "@/lib/social-content-workflow";
import { adStageLabel } from "@/lib/social-ad-workflow";
import type { SocialAdStage, SocialContentStage, SocialContentType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

interface PipelineContentItem {
  id: string;
  type: SocialContentType;
  title: string;
  stage: SocialContentStage;
  scheduledFor: string | null;
  updatedAt: string;
}

interface PipelineAdCampaign {
  id: string;
  name: string;
  stage: SocialAdStage;
  updatedAt: string;
}

interface PipelineReport {
  id: string;
  year: number;
  month: number;
  title: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

interface PipelineClient {
  id: string;
  name: string;
  companyName: string | null;
  contentItems: PipelineContentItem[];
  adCampaigns: PipelineAdCampaign[];
  monthlyReports: PipelineReport[];
}

const TYPE_LABEL: Record<SocialContentType, string> = {
  STATIC_POST: "Static Post",
  CAROUSEL: "Carousel",
  AI_REEL: "AI Reel",
  REAL_PERSON_REEL: "Real Person Reel",
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Everything published/uploaded/completed reads as a settled "done" green; everything still moving reads neutral — the summary line is meant to answer "what's still in flight", not distinguish every stage by color. */
function stageVariant(stage: SocialContentStage | SocialAdStage): "success" | "outline" {
  return stage === "PUBLISHED" || stage === "COMPLETED" ? "success" : "outline";
}

/**
 * Per-client breakdown of every content item (reel, post, carousel), ad
 * campaign, and monthly report, each with its current stage — a collapsed
 * summary badge row per client, expanding to the full Content/Ads/Reports
 * breakdown on click. Backed by GET /api/social/pipeline, which is lead-only
 * (a company Admin/Super Admin always qualifies too, see
 * social-media-permissions.ts) since it aggregates across every client
 * regardless of who owns it. Shared as-is across three places someone with
 * the right access might look for it: the Social Media Team console's own
 * tab, the company admin dashboard, and a non-admin Social Media lead's own
 * dashboard.
 */
export function ClientPipeline() {
  const [clients, setClients] = useState<PipelineClient[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    fetch("/api/social/pipeline")
      .then((r) => {
        if (r.status === 403) {
          if (active) setForbidden(true);
          return null;
        }
        return r.ok ? r.json() : Promise.reject();
      })
      .then((d) => {
        if (active && d) setClients(d.clients ?? []);
      })
      .catch(() => {
        if (active) setClients([]);
      });
    return () => {
      active = false;
    };
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Not a lead/admin — rendered by a page that's already supposed to be
  // admin-only, so this is a quiet no-op rather than an error card.
  if (forbidden) return null;

  if (!clients) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing in production right now.</CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {clients.map((client) => {
        const isOpen = expanded.has(client.id);
        const counts = new Map<string, number>();
        for (const item of client.contentItems) {
          const label = stageLabel(item.type, item.stage);
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }

        return (
          <Card key={client.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(client.id)}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
              aria-expanded={isOpen}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {client.name}
                  {client.companyName && <span className="ml-1.5 font-normal text-muted-foreground">· {client.companyName}</span>}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Array.from(counts.entries()).map(([label, count]) => (
                    <Badge key={label} variant={label === "Published" || label === "Upload" ? "success" : "outline"}>
                      {count} {label}
                    </Badge>
                  ))}
                </div>
              </div>
              <IconChevronDown
                className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
              />
            </button>

            {isOpen && (
              <CardContent className="flex flex-col gap-4 border-t border-border pt-3">
                {client.contentItems.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Content</p>
                    {client.contentItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{TYPE_LABEL[item.type]}</p>
                        </div>
                        <Badge variant={stageVariant(item.stage)} className="shrink-0">
                          {stageLabel(item.type, item.stage)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {client.adCampaigns.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ads</p>
                    {client.adCampaigns.map((ad) => (
                      <div key={ad.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                        <p className="min-w-0 truncate font-medium">{ad.name}</p>
                        <Badge variant={stageVariant(ad.stage)} className="shrink-0">
                          {adStageLabel(ad.stage)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {client.monthlyReports.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reports</p>
                    {client.monthlyReports.map((report) => (
                      <div key={report.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                        <p className="min-w-0 truncate font-medium">
                          {report.title || `${MONTH_ABBR[report.month - 1]} ${report.year}`}
                        </p>
                        <Badge variant={report.reviewedAt ? "success" : "outline"} className="shrink-0">
                          {report.reviewedAt ? "Reviewed" : "Pending review"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  href={`/social-media/${client.id}`}
                  className="flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
                >
                  Open {client.name}
                  <IconExternalLink className="h-3 w-3" />
                </Link>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
