"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SkeletonList } from "@/components/ui/skeleton";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { istMinutesOfDay } from "@/lib/attendance";
import { recencyLabel } from "@/lib/recency";
import { TASK_STATUSES } from "@/components/tasks/types";
import { cn } from "@/lib/utils";

interface TimelineTask {
  id: string;
  title: string;
  dueDate: string;
  createdAt: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: string;
  /** Still IN_PROGRESS/REVIEW past its own due date — carried forward onto today's strip until it's actually completed, rather than just vanishing. */
  isCarriedOver: boolean;
}

const TASK_STATUS_LABEL: Record<string, string> = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label]));

interface TimelineUser {
  id: string;
  name: string;
  avatarDataUrl: string | null;
  department: string | null;
  tasks: TimelineTask[];
}

/** Same palette every other priority dot/badge in the app uses — just as a filled marker instead of a <Badge>. */
const PRIORITY_DOT: Record<TimelineTask["priority"], string> = {
  LOW: "bg-muted-foreground",
  MEDIUM: "bg-primary",
  HIGH: "bg-amber-500",
  URGENT: "bg-destructive",
};

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function hourLabel(h: number) {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** Minutes-past-midnight (IST) for a task's due time, as a 0–100 position on the 24h strip. */
function taskPct(dueDate: string) {
  const d = new Date(dueDate);
  const istMinutes = istMinutesOfDay(d);
  return (istMinutes / (24 * 60)) * 100;
}

function fmtDueTime(dueDate: string) {
  const d = new Date(dueDate);
  return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

function fmtDueDateTime(dueDate: string) {
  const d = new Date(dueDate);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** "Title · Status · Due ... · Added ..." — one line for the tooltip. */
function taskTooltipLabel(t: TimelineTask) {
  const due = t.isCarriedOver ? `Was due ${fmtDueDateTime(t.dueDate)}` : `Due ${fmtDueTime(t.dueDate)}`;
  const age = recencyLabel(t.createdAt);
  const added = age && (age.isNew ? "Added today" : `Added ${age.text.toLowerCase()}`);
  return [t.title, TASK_STATUS_LABEL[t.status] ?? t.status, due, added].filter(Boolean).join(" · ");
}

/**
 * Tasks due within ~9 minutes of each other would render as one dot sitting
 * exactly on top of another with no way to reach the one underneath. Cluster
 * near-neighbors (by due-time %) and spread them with a small alternating
 * vertical offset so every dot stays independently hoverable.
 */
const CLUSTER_THRESHOLD_PCT = 0.6;
function layoutTaskDots(tasks: TimelineTask[]) {
  const sorted = tasks.map((t) => ({ t, pct: taskPct(t.dueDate) })).sort((a, b) => a.pct - b.pct);
  let clusterStart = 0;
  return sorted.map((entry, i) => {
    if (i === 0 || entry.pct - sorted[i - 1].pct > CLUSTER_THRESHOLD_PCT) clusterStart = i;
    // Cycle through a bounded set of offsets (rather than growing unbounded) so a
    // dot never drifts outside the track's own height, however big the cluster.
    const n = (i - clusterStart) % 3;
    const offsetY = n === 0 ? 0 : n === 1 ? 5 : -5;
    return { ...entry, offsetY };
  });
}

export function TodayTimeline() {
  const [users, setUsers] = useState<TimelineUser[] | null>(null);
  const [error, setError] = useState(false);
  const [nowPct, setNowPct] = useState<number | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/dashboard/today-timeline")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("request failed"))))
        .then((d) => {
          setUsers(d?.users ?? []);
          setError(false);
        })
        .catch(() => setError(true));
    load();
    // Re-pull every 2 minutes so a task added/edited elsewhere shows up without a manual reload.
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, []);

  // The "now" line — recomputed every minute so it actually moves while the page sits open.
  useEffect(() => {
    const update = () => setNowPct((istMinutesOfDay() / (24 * 60)) * 100);
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  const groups = users
    ? Object.entries(
        users.reduce<Record<string, TimelineUser[]>>((acc, u) => {
          const key = u.department ?? "No department";
          (acc[key] ??= []).push(u);
          return acc;
        }, {})
      ).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-1.5 space-y-0">
        <CardTitle>Today&apos;s tasks</CardTitle>
        <HelpDialog title="Today's tasks — help">
          <HelpSection heading="What this shows">
            <p>Every active user, grouped by department, with each of today&apos;s tasks placed on a 24-hour strip at its due time. The vertical line marks the current time. Hover a dot for its title, status, due time, and when it was added.</p>
          </HelpSection>
          <HelpSection heading="Carried-over tasks">
            <p>A task still In Progress or In Review past its due date keeps showing up here, at its original due time, every day until it&apos;s marked Completed — marked with a dashed outline so it&apos;s clear it&apos;s not due today.</p>
          </HelpSection>
        </HelpDialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {users === null && !error ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Couldn&apos;t load today&apos;s tasks. Try reloading the page.</p>
        ) : users && users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No one to show here.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {/* Hour axis */}
              <div className="mb-2 flex pl-40">
                <div className="relative h-4 flex-1">
                  {HOUR_MARKS.map((h) => (
                    <span
                      key={h}
                      className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
                      style={{ left: `${(h / 24) * 100}%` }}
                    >
                      {hourLabel(h)}
                    </span>
                  ))}
                </div>
              </div>

              {groups.map(([department, deptUsers]) => (
                <div key={department} className="mb-3 last:mb-0">
                  <p className="mb-1 pl-40 text-xs font-semibold text-muted-foreground">{department}</p>
                  {deptUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 border-t border-border/50 py-1.5 first:border-t-0">
                      <div className="flex w-40 shrink-0 items-center gap-1.5 pr-2">
                        <UserAvatar name={u.name} avatarDataUrl={u.avatarDataUrl} className="h-5 w-5" />
                        <span className="truncate text-xs font-medium">{u.name}</span>
                      </div>
                      <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted/40">
                        {HOUR_MARKS.slice(1, -1).map((h) => (
                          <div key={h} className="absolute inset-y-0 border-l border-border/40" style={{ left: `${(h / 24) * 100}%` }} />
                        ))}
                        {nowPct !== null && (
                          <div className="absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${nowPct}%` }} />
                        )}
                        {layoutTaskDots(u.tasks).map(({ t, pct, offsetY }) => (
                          <Tooltip key={t.id} label={taskTooltipLabel(t)}>
                            <div
                              className={cn(
                                "absolute top-1/2 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                                PRIORITY_DOT[t.priority],
                                (t.status === "COMPLETED" || t.status === "CANCELLED") && "opacity-40",
                                // Carried over from a past due date, still open — a dashed
                                // outline marks it as "still showing up" rather than new today.
                                t.isCarriedOver && "outline outline-2 outline-dashed outline-offset-1 outline-foreground/50"
                              )}
                              style={{ left: `${pct}%`, transform: `translate(-50%, calc(-50% + ${offsetY}px))` }}
                            />
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
