"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SkeletonList } from "@/components/ui/skeleton";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { istMinutesOfDay, istDateKey, dateFromKey } from "@/lib/attendance";
import { recencyLabel } from "@/lib/recency";
import { TASK_STATUSES } from "@/components/tasks/types";
import { cn } from "@/lib/utils";

type ViewMode = "today" | "yesterday" | "week" | "month";

const VIEW_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

interface TimelineTask {
  id: string;
  title: string;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
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

/** Same palette every other priority dot/badge in the app uses. */
const PRIORITY_BAR: Record<TimelineTask["priority"], string> = {
  LOW: "bg-muted-foreground",
  MEDIUM: "bg-primary",
  HIGH: "bg-amber-500",
  URGENT: "bg-destructive",
};

const LANE_HEIGHT = 20;
const LANE_GAP = 3;
const ROW_V_PADDING = 8;

function dayHeaderLabel(key: string, compact: boolean) {
  return dateFromKey(key).toLocaleDateString("en-IN", compact ? { day: "numeric", timeZone: "UTC" } : { weekday: "short", day: "numeric", timeZone: "UTC" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

/* --------------------------- Week / Month bar view --------------------------- */

/**
 * Where a task's bar sits on the displayed day grid: `createdAt`'s day
 * through its due day — except a task still IN_PROGRESS/REVIEW past its due
 * date keeps growing one column further for every day it stays open,
 * instead of stopping dead at the original due date, and a COMPLETED task
 * with a recorded completion time ends there instead. Clipped to the
 * displayed days; returns null for a task whose bar doesn't actually overlap
 * the range (shouldn't happen given the API's own filter, but kept
 * defensive).
 */
function layoutTaskBar(t: TimelineTask, days: string[], todayKey: string) {
  const createdKey = istDateKey(new Date(t.createdAt));
  const dueKey = t.dueDate ? istDateKey(new Date(t.dueDate)) : createdKey;
  const isOpen = t.status === "IN_PROGRESS" || t.status === "REVIEW";
  let endKey: string;
  if (t.status === "COMPLETED" && t.completedAt) endKey = istDateKey(new Date(t.completedAt));
  else if (isOpen && dueKey < todayKey) endKey = todayKey;
  else endKey = dueKey;
  const startKey = createdKey < endKey ? createdKey : endKey;
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (endKey < firstDay || startKey > lastDay) return null;
  const clippedStart = startKey < firstDay ? firstDay : startKey;
  const clippedEnd = endKey > lastDay ? lastDay : endKey;
  const startIdx = days.indexOf(clippedStart);
  const endIdx = days.indexOf(clippedEnd);
  return { t, startIdx, endIdx, isCarriedOver: isOpen && endKey > dueKey };
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

/** "Title · Status · Due/Was due/Completed ... · Added ..." — one line for the tooltip. */
function barTooltipLabel(t: TimelineTask, isCarriedOver: boolean) {
  const end =
    t.status === "COMPLETED" && t.completedAt
      ? `Completed ${fmtDateTime(t.completedAt)}`
      : t.dueDate
        ? `${isCarriedOver ? "Was due" : "Due"} ${fmtDateTime(t.dueDate)}`
        : null;
  const age = recencyLabel(t.createdAt);
  const added = age && (age.isNew ? "Added today" : `Added ${age.text.toLowerCase()}`);
  return [t.title, TASK_STATUS_LABEL[t.status] ?? t.status, end, added].filter(Boolean).join(" · ");
}

/* --------------------------- Today / Yesterday hourly view --------------------------- */

interface TimelineEvent {
  task: TimelineTask;
  type: "added" | "due" | "completed";
  at: string;
}

/** Every added/due/completed event belonging to `task` that lands on `dayKey` — a task can contribute more than one. */
function dayEventsFor(tasks: TimelineTask[], dayKey: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const t of tasks) {
    if (istDateKey(new Date(t.createdAt)) === dayKey) events.push({ task: t, type: "added", at: t.createdAt });
    if (t.dueDate && istDateKey(new Date(t.dueDate)) === dayKey) events.push({ task: t, type: "due", at: t.dueDate });
    if (t.completedAt && istDateKey(new Date(t.completedAt)) === dayKey) events.push({ task: t, type: "completed", at: t.completedAt });
  }
  return events;
}

function hourPct(iso: string) {
  return (istMinutesOfDay(new Date(iso)) / 1440) * 100;
}

/**
 * Events within ~9 minutes of each other would render as one dot sitting
 * exactly on top of another with no way to reach the one underneath. Cluster
 * near-neighbors (by time %) and spread them with a small alternating
 * vertical offset so every dot stays independently hoverable.
 */
const CLUSTER_THRESHOLD_PCT = 0.6;
function layoutEventDots(events: TimelineEvent[]) {
  const sorted = events.map((e) => ({ e, pct: hourPct(e.at) })).sort((a, b) => a.pct - b.pct);
  let clusterStart = 0;
  return sorted.map((entry, i) => {
    if (i === 0 || entry.pct - sorted[i - 1].pct > CLUSTER_THRESHOLD_PCT) clusterStart = i;
    const n = (i - clusterStart) % 3;
    const offsetY = n === 0 ? 0 : n === 1 ? 5 : -5;
    return { ...entry, offsetY };
  });
}

const EVENT_TYPE_LABEL: Record<TimelineEvent["type"], string> = { added: "Added", due: "Due", completed: "Completed" };

function eventTooltipLabel(e: TimelineEvent) {
  return [e.task.title, `${EVENT_TYPE_LABEL[e.type]} ${fmtTime(e.at)}`, TASK_STATUS_LABEL[e.task.status] ?? e.task.status].join(" · ");
}

const HOUR_LABEL_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
function hourLabel(h: number) {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function TodayTimeline() {
  const [view, setView] = useState<ViewMode>("week");
  const [data, setData] = useState<{ days: string[]; users: TimelineUser[] } | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setData(null);
    setError(false);
    const load = () =>
      fetch(`/api/dashboard/today-timeline?view=${view}`)
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
  }, [view]);

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
  const isDayView = view === "today" || view === "yesterday";
  const dayViewKey = days[0] ?? null;
  const isLiveDay = isDayView && dayViewKey !== null && todayKey === dayViewKey;
  const nowHourPct = isLiveDay && now ? (istMinutesOfDay(now) / 1440) * 100 : null;

  const todayIdx = !isDayView && todayKey ? days.indexOf(todayKey) : -1;
  const dayWidthPct = days.length > 0 ? 100 / days.length : 0;
  const nowWeekPct = !isDayView && now && todayIdx >= 0 ? ((todayIdx + istMinutesOfDay(now) / 1440) / days.length) * 100 : null;

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
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle>Today&apos;s tasks</CardTitle>
        <HelpDialog title="Today's tasks — help">
          <HelpSection heading="What this shows">
            <p>
              Every active user, grouped by department. Today/Yesterday show each task as a dot on an hourly strip, at the
              moment it was added, due, or completed. Week/Month lay tasks out as a bar from the day it was added through
              its due day (or completion day, once it has one). Hover a dot or bar for its title, status, and timing.
            </p>
          </HelpSection>
          <HelpSection heading="Carried-over tasks">
            <p>
              On Week/Month, a task still In Progress or In Review past its due date keeps growing — one day further every
              day it stays open — instead of stopping at the original due date, until it&apos;s actually marked Completed.
              Marked with a dashed outline.
            </p>
          </HelpSection>
        </HelpDialog>
        <Dropdown size="sm" value={view} onChange={(v) => setView(v as ViewMode)} options={VIEW_OPTIONS} className="ml-auto w-36" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {users === null && !error ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Couldn&apos;t load today&apos;s tasks. Try reloading the page.</p>
        ) : users && users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No one to show here.</p>
        ) : isDayView ? (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {/* Hour axis — gridlines every hour, labels every 3 hours */}
              <div className="mb-2 flex pl-40">
                <div className="relative h-4 flex-1">
                  {HOUR_LABEL_MARKS.map((h) => (
                    <span key={h} className="absolute -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${(h / 24) * 100}%` }}>
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
                        {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                          <div key={h} className="absolute inset-y-0 border-l border-border/30" style={{ left: `${(h / 24) * 100}%` }} />
                        ))}
                        {nowHourPct !== null && <div className="absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${nowHourPct}%` }} />}
                        {dayViewKey &&
                          layoutEventDots(dayEventsFor(u.tasks, dayViewKey)).map(({ e, pct, offsetY }) => (
                            <Tooltip key={`${e.task.id}-${e.type}`} label={eventTooltipLabel(e)}>
                              <div
                                className={cn(
                                  "absolute top-1/2 ring-2 ring-background",
                                  PRIORITY_BAR[e.task.priority],
                                  e.type === "added" && "h-2.5 w-2.5 rounded-full",
                                  e.type === "due" && "h-2.5 w-2.5 rotate-45",
                                  e.type === "completed" && "h-2.5 w-2.5 rounded-full opacity-60"
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

              <div className="mt-2 flex flex-wrap gap-3 pl-40 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Added
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rotate-45 bg-muted-foreground" /> Due
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground opacity-60" /> Completed
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(640, days.length * 90) }}>
              {/* Day axis */}
              <div className="mb-2 flex pl-40">
                {days.map((key, i) => (
                  <div
                    key={key}
                    className={cn("rounded text-center text-[10px] font-medium text-muted-foreground", i === todayIdx && "bg-primary/10 text-primary")}
                    style={{ width: `${dayWidthPct}%` }}
                  >
                    {dayHeaderLabel(key, view === "month")}
                  </div>
                ))}
              </div>

              {groups.map(([department, deptUsers]) => (
                <div key={department} className="mb-3 last:mb-0">
                  <p className="mb-1 pl-40 text-xs font-semibold text-muted-foreground">{department}</p>
                  {deptUsers.map((u) => {
                    const bars = assignLanes(
                      u.tasks.map((t) => (todayKey ? layoutTaskBar(t, days, todayKey) : null)).filter((b): b is PositionedTask => b !== null)
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
                            <div className="absolute inset-y-0 bg-primary/5" style={{ left: `${todayIdx * dayWidthPct}%`, width: `${dayWidthPct}%` }} />
                          )}
                          {days.slice(1).map((_, i) => (
                            <div key={i} className="absolute inset-y-0 border-l border-border/40" style={{ left: `${(i + 1) * dayWidthPct}%` }} />
                          ))}
                          {nowWeekPct !== null && <div className="absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${nowWeekPct}%` }} />}
                          {bars.map(({ t, startIdx, endIdx, lane, isCarriedOver }) => (
                            <Tooltip key={t.id} label={barTooltipLabel(t, isCarriedOver)}>
                              <div
                                className={cn(
                                  "absolute flex items-center truncate rounded px-1.5 text-[10px] font-medium text-white",
                                  PRIORITY_BAR[t.priority],
                                  (t.status === "COMPLETED" || t.status === "CANCELLED") && "opacity-40",
                                  // Carried over from a past due date, still open — a dashed outline
                                  // marks it as "still showing up" rather than newly due this range.
                                  isCarriedOver && "outline outline-2 outline-dashed outline-offset-1 outline-foreground/50"
                                )}
                                style={{
                                  left: `calc(${startIdx * dayWidthPct}% + 2px)`,
                                  width: `calc(${(endIdx - startIdx + 1) * dayWidthPct}% - 4px)`,
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
