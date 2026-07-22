"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import {
  IconClock,
  IconCheck,
  IconTasks,
  IconLeads,
  IconProjects,
  IconCalendar,
  IconMessage,
} from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { formatIstTime, formatDuration } from "@/lib/attendance-ui";
import { cn } from "@/lib/utils";

interface MeDashboard {
  todayKey: string;
  attendance: {
    checkIn: string | null;
    checkOut: string | null;
    status: string | null;
    workedMinutes: number | null;
    onLeave: { type: string; reason: string | null } | null;
    monthSummary: { present: number; halfDay: number; absent: number; attendancePercent: number };
  };
  tasks: {
    open: number;
    overdue: number;
    dueToday: number;
    upcoming: { id: string; title: string; status: string; priority: string; dueDate: string | null }[];
  };
  leads: { open: number; recent: { id: string; name: string; company: string | null; status: string }[] };
  meetings: { id: string; title: string; startsAt: string; location: string | null }[];
  projects: number;
  unreadChats: number;
}

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function whenLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return `Today · ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, "h:mm a")}`;
  return format(d, "MMM d · h:mm a");
}

export function UserDashboard({ firstName }: { firstName: string }) {
  const toast = useToast();
  const [data, setData] = useState<MeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/me");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function punch(kind: "check-in" | "check-out") {
    setActing(true);
    try {
      const res = await fetch(`/api/attendance/${kind}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(kind === "check-in" ? "Couldn't check in" : "Couldn't check out", json.error);
      toast.success(kind === "check-in" ? "Checked in" : "Checked out");
      await load();
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[55vh] flex-1 items-center justify-center">
        <SkeletonTable rows={4} columns={4} />
      </div>
    );
  }
  if (!data) return null;

  const { attendance: att, tasks, leads, meetings } = data;
  const checkedIn = !!att.checkIn;
  const checkedOut = !!att.checkOut;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting + today's attendance */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
            <p className="mt-2 text-sm">
              {att.onLeave ? (
                <span className="text-amber-500">
                  On {att.onLeave.type === "FULL_DAY" ? "full-day" : "half-day"} leave
                  {att.onLeave.reason ? ` — ${att.onLeave.reason}` : ""}
                </span>
              ) : checkedOut ? (
                <span className="text-muted-foreground">
                  Checked out at {formatIstTime(att.checkOut)} · {formatDuration(att.workedMinutes)}
                </span>
              ) : checkedIn ? (
                <span className="text-emerald-500">Checked in at {formatIstTime(att.checkIn)}</span>
              ) : (
                <span className="text-muted-foreground">You haven&apos;t checked in yet</span>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!att.onLeave && !checkedIn && (
              <Button type="button" onClick={() => punch("check-in")} disabled={acting}>
                <IconClock className="h-4 w-4" />
                Check In
              </Button>
            )}
            {!att.onLeave && checkedIn && !checkedOut && (
              <Button type="button" onClick={() => punch("check-out")} disabled={acting}>
                <IconCheck className="h-4 w-4" />
                Check Out
              </Button>
            )}
            {checkedOut && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconCheck className="h-4 w-4 text-emerald-500" />
                Done for today
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          href="/tasks"
          icon={<IconTasks className="h-4 w-4" />}
          label="Open tasks"
          value={tasks.open}
          hint={tasks.overdue > 0 ? `${tasks.overdue} overdue` : tasks.dueToday > 0 ? `${tasks.dueToday} due today` : "Nothing overdue"}
          tone={tasks.overdue > 0 ? "danger" : "default"}
        />
        <StatTile href="/leads" icon={<IconLeads className="h-4 w-4" />} label="Active leads" value={leads.open} hint="Assigned to you" />
        <StatTile href="/meetings" icon={<IconCalendar className="h-4 w-4" />} label="Upcoming meetings" value={meetings.length} hint={meetings[0] ? whenLabel(meetings[0].startsAt) : "None scheduled"} />
        <StatTile
          href="/messages"
          icon={<IconMessage className="h-4 w-4" />}
          label="Unread chats"
          value={data.unreadChats}
          hint={data.unreadChats > 0 ? "New messages" : "All caught up"}
          tone={data.unreadChats > 0 ? "primary" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Tasks due next */}
        <Panel title="Your next tasks" href="/tasks" empty={tasks.upcoming.length === 0} emptyLabel="No open tasks — nice.">
          {tasks.upcoming.map((t) => {
            const overdue = t.dueDate && parseISO(t.dueDate) < new Date();
            return (
              <Link key={t.id} href="/tasks" className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{pretty(t.status)}</span>
                </span>
                {t.dueDate && (
                  <span className={cn("shrink-0 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                    {overdue ? `${formatDistanceToNowStrict(parseISO(t.dueDate))} late` : format(parseISO(t.dueDate), "MMM d")}
                  </span>
                )}
              </Link>
            );
          })}
        </Panel>

        {/* Meetings */}
        <Panel title="Upcoming meetings" href="/meetings" empty={meetings.length === 0} emptyLabel="Nothing scheduled.">
          {meetings.map((m) => (
            <Link key={m.id} href="/meetings" className="flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-primary/5">
              <span className="truncate text-sm">{m.title}</span>
              <span className="text-xs text-muted-foreground">
                {whenLabel(m.startsAt)}
                {m.location ? ` · ${m.location}` : ""}
              </span>
            </Link>
          ))}
        </Panel>

        {/* Leads + month attendance */}
        <div className="flex flex-col gap-4">
          <Panel title="Recent leads" href="/leads" empty={leads.recent.length === 0} emptyLabel="No active leads.">
            {leads.recent.map((l) => (
              <Link key={l.id} href="/leads" className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{l.name}</span>
                  {l.company && <span className="block truncate text-xs text-muted-foreground">{l.company}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">{pretty(l.status)}</span>
              </Link>
            ))}
          </Panel>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">This month</p>
                <Link href="/attendance" className="text-xs text-primary hover:underline">
                  Attendance
                </Link>
              </div>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{att.monthSummary.attendancePercent.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">Attendance</p>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-500">{att.monthSummary.present} present</span>
                  <span className="text-amber-500">{att.monthSummary.halfDay} half</span>
                  <span className="text-red-500">{att.monthSummary.absent} absent</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Link href="/projects">
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <IconProjects className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{data.projects} projects</span>
                  <span className="block text-xs text-muted-foreground">You&apos;re a member of</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  href,
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardContent className="flex flex-col gap-1 p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {icon}
            {label}
          </span>
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              tone === "danger" && "text-destructive",
              tone === "primary" && "text-primary"
            )}
          >
            {value}
          </span>
          {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
        </CardContent>
      </Card>
    </Link>
  );
}

function Panel({
  title,
  href,
  children,
  empty,
  emptyLabel,
}: {
  title: string;
  href: string;
  children: ReactNode;
  empty: boolean;
  emptyLabel: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-medium">{title}</p>
        <Link href={href} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      <CardContent className="p-0">
        {empty ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
