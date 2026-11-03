"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SkeletonList } from "@/components/ui/skeleton";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { istMinutesOfDay, istDateKey, dateFromKey } from "@/lib/attendance";
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
}

interface TimelineUser {
  id: string;
  name: string;
  avatarDataUrl: string | null;
  department: string | null;
  tasks: TimelineTask[];
}

const TASK_STATUS_LABEL: Record<string, string> = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label]));

/** Same palette every other priority dot/badge in the app uses — as a filled bar instead of a <Badge>. */
const PRIORITY_BAR: Record<TimelineTask["priority"], string> = {
  LOW: "bg-muted-foreground",
  MEDIUM: "bg-primary",
  HIGH: "bg-amber-500",
  URGENT: "bg-destructive",
};

const DAY_WIDTH_PCT = 100 / 7;
const LANE_HEIGHT = 20;
const LANE_GAP = 3;
const ROW_V_PADDING = 8;

function dayHeaderLabel(key: string) {
  return dateFromKey(key).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

function fmtDueDateTime(dueDate: string) {
  return new Date(dueDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Where a task's bar sits on the week grid: `createdAt`'s day through its
 * due day — except a task still IN_PROGRESS/REVIEW past its due date keeps
 * growing one column further for every day it stays open, instead of
 * stopping dead at the original due date. Clipped to the 7 displayed days;
 * returns null for a task whose bar doesn't actually overlap this week
 * (shouldn't happen given the API's own filter, but kept defensive).
 */
function layoutTaskBar(t: TimelineTask, days: string[], todayKey: string) {
  const createdKey = istDateKey(new Date(t.createdAt));
  const dueKey = istDateKey(new Date(t.dueDate));
  const isOpen = t.status === "IN_PROGRESS" || t.status === "REVIEW";
  const endKey = isOpen && dueKey < todayKey ? todayKey : dueKey;
  const startKey = createdKey < endKey ? createdKey : endKey;
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (endKey < firstDay || startKey > lastDay) return null;
  const clippedStart = startKey < firstDay ? firstDay : startKey;
  const clippedEnd = endKey > lastDay ? lastDay : endKey;
  const startIdx = days.indexOf(clippedStart);
  const endIdx = days.indexOf(clippedEnd);
  return { t, startIdx, endIdx, isCarriedOver: endKey > dueKey };
}

type PositionedTask = NonNullable<ReturnType<typeof layoutTaskBar>>;

/** Interval-graph lane assignment — the classic Gantt/calendar stacking, so overlapping bars never cover each other. */
function assignLanes(bars: PositionedTask[]): (PositionedTask & { lane: number })[] {
  const sorted = [...bars].sort((a, b) => a.startIdx - b.startIdx);
  const laneEndIdx: number[] = [];
  return sorted.map((bar) => {
    let lane = laneEndIdx.findIndex((end) => end < bar.startIdx);
    if (lane === -1) {
      lane = laneEndIdx.length;
      laneEndIdx.push(bar.endIdx);
    } else {
      laneEndIdx[lane] = bar.endIdx;
    }
    return { ...bar, lane };
  });
}

/** "Title · Status · Due ... · Added ..." — one line for the tooltip. */
function taskTooltipLabel(t: TimelineTask, isCarriedOver: boolean) {
  const due = isCarriedOver ? `Was due ${fmtDueDateTime(t.dueDate)}` : `Due ${fmtDueDateTime(t.dueDate)}`;
  const age = recencyLabel(t.createdAt);
  const added = age && (age.isNew ? "Added today" : `Added ${age.text.toLowerCase()}`);
  return [t.title, TASK_STATUS_LABEL[t.status] ?? t.status, due, added].filter(Boolean).join(" · ");
}

export function TodayTimeline() {
  const [data, setData] = useState<{ days: string[]; users: TimelineUser[] } | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/dashboard/today-timeline")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("request failed"))))
        .then((d) => {
          setData({ days: d?.days ?? [], users: d?.users ?? [] });
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
    const update = () => setNow(new Date());
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  const days = data?.days ?? [];
  const users = data?.users ?? null;
  const todayKey = now ? istDateKey(now) : null;
  const todayIdx = todayKey ? days.indexOf(todayKey) : -1;
  const nowPct = now && todayIdx >= 0 ? ((todayIdx + istMinutesOfDay(now) / 1440) / 7) * 100 : null;

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
            <p>
              Every active user, grouped by department, with each of this week&apos;s tasks laid out as a bar from the day it
              was added through its due day. The vertical line marks the current day and time. Hover a bar for its title,
              status, due date, and when it was added.
            </p>
          </HelpSection>
          <HelpSection heading="Carried-over tasks">
            <p>
              A task still In Progress or In Review past its due date keeps growing — one day further every day it stays
              open — instead of stopping at the original due date, until it&apos;s actually marked Completed. Marked with a
              dashed outline.
            </p>
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
              {/* Day axis */}
              <div className="mb-2 flex pl-40">
                {days.map((key, i) => (
                  <div
                    key={key}
                    className={cn(
                      "rounded text-center text-[10px] font-medium text-muted-foreground",
                      i === todayIdx && "bg-primary/10 text-primary"
                    )}
                    style={{ width: `${DAY_WIDTH_PCT}%` }}
                  >
                    {dayHeaderLabel(key)}
                  </div>
                ))}
              </div>

              {groups.map(([department, deptUsers]) => (
                <div key={department} className="mb-3 last:mb-0">
                  <p className="mb-1 pl-40 text-xs font-semibold text-muted-foreground">{department}</p>
                  {deptUsers.map((u) => {
                    const bars = assignLanes(
                      u.tasks
                        .map((t) => (todayKey ? layoutTaskBar(t, days, todayKey) : null))
                        .filter((b): b is PositionedTask => b !== null)
                    );
                    const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
                    const rowHeight = lanes * LANE_HEIGHT + (lanes - 1) * LANE_GAP + ROW_V_PADDING * 2;

                    return (
                      <div key={u.id} className="flex items-center gap-2 border-t border-border/50 py-1.5 first:border-t-0">
                        <div className="flex w-40 shrink-0 items-center gap-1.5 pr-2">
                          <UserAvatar name={u.name} avatarDataUrl={u.avatarDataUrl} className="h-5 w-5" />
                          <span className="truncate text-xs font-medium">{u.name}</span>
                        </div>
                        <div className="relative flex-1 overflow-hidden rounded bg-muted/40" style={{ height: rowHeight }}>
                          {todayIdx >= 0 && (
                            <div
                              className="absolute inset-y-0 bg-primary/5"
                              style={{ left: `${todayIdx * DAY_WIDTH_PCT}%`, width: `${DAY_WIDTH_PCT}%` }}
                            />
                          )}
                          {Array.from({ length: 6 }, (_, i) => i + 1).map((i) => (
                            <div key={i} className="absolute inset-y-0 border-l border-border/40" style={{ left: `${i * DAY_WIDTH_PCT}%` }} />
                          ))}
                          {nowPct !== null && <div className="absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${nowPct}%` }} />}
                          {bars.map(({ t, startIdx, endIdx, lane, isCarriedOver }) => (
                            <Tooltip key={t.id} label={taskTooltipLabel(t, isCarriedOver)}>
                              <div
                                className={cn(
                                  "absolute flex items-center truncate rounded px-1.5 text-[10px] font-medium text-white",
                                  PRIORITY_BAR[t.priority],
                                  (t.status === "COMPLETED" || t.status === "CANCELLED") && "opacity-40",
                                  // Carried over from a past due date, still open — a dashed outline
                                  // marks it as "still showing up" rather than newly due this week.
                                  isCarriedOver && "outline outline-2 outline-dashed outline-offset-1 outline-foreground/50"
                                )}
                                style={{
                                  left: `calc(${startIdx * DAY_WIDTH_PCT}% + 2px)`,
                                  width: `calc(${(endIdx - startIdx + 1) * DAY_WIDTH_PCT}% - 4px)`,
                                  top: ROW_V_PADDING + lane * (LANE_HEIGHT + LANE_GAP),
                                  height: LANE_HEIGHT,
                                }}
                              >
                                {t.title}
                              </div>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
