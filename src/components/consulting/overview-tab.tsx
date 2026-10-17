"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHECKLISTS,
  LIFECYCLE_STAGES,
  REGISTER_KIND_DEFS,
  checklistProgress,
  formatItemCode,
  isOpenItem,
  isOverdue,
  riskScore,
} from "@/lib/consulting";
import { cn } from "@/lib/utils";
import type { Engagement, RegisterItem } from "./types";
import { ProgressBar, QualificationBadge, StageStatusBadge, StatTile, formatDateKey } from "./shared";

type OpenableTab = "profile" | "lifecycle" | "registers" | "diagnostic";

/** Today in IST as "YYYY-MM-DD" — the same day boundary the server's overdue counts use. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function OverviewTab({
  engagement,
  items,
  onOpenTab,
}: {
  engagement: Engagement;
  items: RegisterItem[];
  onOpenTab: (tab: OpenableTab) => void;
}) {
  const today = istToday();
  const stage = LIFECYCLE_STAGES[engagement.currentStage];
  const stageRow = engagement.stages.find((s) => s.stage === stage.stage);

  const { openActions, overdue, upcoming, openRisks, topRisks, openIssues, approved, nextMeeting } = useMemo(() => {
    const actions = items.filter((i) => i.kind === "ACTION" && isOpenItem(i.kind, i.status));
    const risks = items.filter((i) => i.kind === "RISK" && isOpenItem(i.kind, i.status));
    const meetings = items
      .filter((i) => i.kind === "MEETING" && i.status === "SCHEDULED" && i.dueDate && i.dueDate >= today)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
    return {
      openActions: actions.length,
      overdue: actions.filter((i) => isOverdue(i, today)),
      upcoming: actions
        .filter((i) => i.dueDate && !isOverdue(i, today))
        .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
        .slice(0, 5),
      openRisks: risks.length,
      topRisks: risks
        .map((r) => ({ r, score: riskScore(r.details) ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
      openIssues: items.filter((i) => i.kind === "ISSUE" && isOpenItem(i.kind, i.status)).length,
      approved: items.filter((i) => i.kind === "DELIVERABLE" && i.status === "APPROVED").length,
      nextMeeting: meetings[0] ?? null,
    };
  }, [items, today]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Open actions" value={openActions} />
        <StatTile label="Overdue actions" value={overdue.length} tone={overdue.length ? "danger" : undefined} />
        <StatTile label="Open risks" value={openRisks} />
        <StatTile label="Open issues" value={openIssues} />
        <StatTile label="Approved deliverables" value={approved} />
        <StatTile label="Next meeting" value={<span className="text-base">{nextMeeting ? formatDateKey(nextMeeting.dueDate) : "—"}</span>} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Current stage</CardTitle>
            <button type="button" onClick={() => onOpenTab("lifecycle")} className="text-xs text-primary hover:underline">
              Open lifecycle
            </button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {stage.stage}. {stage.name}
              </span>
              {stageRow && <StageStatusBadge status={stageRow.status} />}
            </div>
            <p className="text-muted-foreground">{stage.purpose}</p>
            <p>
              <span className="text-muted-foreground">Exit condition: </span>
              {stage.exitCondition}
            </p>
            {stageRow?.owner && (
              <p>
                <span className="text-muted-foreground">Owner: </span>
                {stageRow.owner.name}
              </p>
            )}
            {stageRow?.plannedEnd && (
              <p>
                <span className="text-muted-foreground">Planned end: </span>
                {formatDateKey(stageRow.plannedEnd)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Qualification & readiness</CardTitle>
            <button type="button" onClick={() => onOpenTab("profile")} className="text-xs text-primary hover:underline">
              Edit profile
            </button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Qualification gate</span>
              <QualificationBadge {...engagement.qualification} />
            </div>
            {CHECKLISTS.map((def) => {
              const { done, total } = checklistProgress(def, engagement.checklists);
              return (
                <div key={def.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{def.label}</span>
                    <span className="tabular-nums">
                      {done}/{total}
                    </span>
                  </div>
                  <ProgressBar value={done / total} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Actions due</CardTitle>
            <button type="button" onClick={() => onOpenTab("registers")} className="text-xs text-primary hover:underline">
              Open registers
            </button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {overdue.length === 0 && upcoming.length === 0 && <p className="text-muted-foreground">No dated open actions.</p>}
            {[...overdue, ...upcoming].map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="mr-1.5 text-xs text-muted-foreground">{formatItemCode(a.kind, a.number)}</span>
                  {a.title}
                </span>
                <span className={cn("whitespace-nowrap text-xs", isOverdue(a, today) ? "text-destructive" : "text-muted-foreground")}>
                  {formatDateKey(a.dueDate)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Top risks</CardTitle>
            <button type="button" onClick={() => onOpenTab("registers")} className="text-xs text-primary hover:underline">
              {REGISTER_KIND_DEFS.RISK.label}
            </button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {topRisks.length === 0 && <p className="text-muted-foreground">No open risks logged.</p>}
            {topRisks.map(({ r, score }) => (
              <div key={r.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="mr-1.5 text-xs text-muted-foreground">{formatItemCode(r.kind, r.number)}</span>
                  {r.title}
                </span>
                <span className={cn("whitespace-nowrap text-xs tabular-nums", score >= 15 ? "text-destructive" : "text-muted-foreground")}>
                  {score ? `Score ${score}` : "Unscored"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
