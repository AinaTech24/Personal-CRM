"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  IconQuotations,
  IconInvoices,
  IconPhone,
  IconBuilding,
  IconImage,
} from "@/components/icons";
import { Dropdown } from "@/components/ui/dropdown";
import { useToast } from "@/components/providers/toast-provider";
import { useDashboardActivity } from "@/components/dashboard/dashboard-activity";
import { Chart, CHART_TYPES, type Slice } from "@/components/dashboard/charts";
import { STATUS_HEX, STATUS_ORDER, statusLabel, type DashboardEntityKey } from "@/lib/dashboard-colors";
import { formatIstTime, formatDuration } from "@/lib/attendance-ui";
import { cn, formatMoney } from "@/lib/utils";

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
  leads: {
    open: number;
    recent: { id: string; name: string; company: string | null; status: string; priority: string }[];
  };
  meetings: { id: string; title: string; startsAt: string; location: string | null }[];
  projects: {
    total: number;
    recent: { id: string; name: string; status: string; progress: number; endDate: string | null }[];
  };
  unreadChats: number;
  /** Status-breakdown counts behind the Overview charts — quotations/invoices are null without CRM access. */
  charts: {
    tasks: Record<string, number>;
    leads: Record<string, number>;
    projects: Record<string, number>;
    quotations: Record<string, number> | null;
    invoices: Record<string, number> | null;
  };
  /** Only present for a CRM Team member (or an admin) — see hasCrmAccess. */
  crm: {
    quotations: {
      open: number;
      recent: { id: string; number: string; clientName: string; status: string; total: number; validUntil: string | null }[];
    };
    invoices: {
      open: number;
      recent: { id: string; number: string; clientName: string; status: string; total: number }[];
    };
    calls: { id: string; clientName: string; callType: string; startTime: string; nextAction: string | null }[];
  } | null;
  /** Only present for a Social Media Team member (or an admin) — see hasSocialMediaAccess. */
  socialMedia: {
    clients: number;
    pendingContent: number;
    content: { id: string; title: string; type: string; stage: string; scheduledFor: string | null; clientName: string }[];
  } | null;
}

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const PRIORITY_VARIANT: Record<string, "secondary" | "default" | "warning" | "destructive"> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
};

const PROJECT_STATUS_VARIANT: Record<string, "secondary" | "default" | "warning" | "success" | "destructive"> = {
  PLANNED: "secondary",
  ACTIVE: "default",
  ON_HOLD: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

const QUOTATION_STATUS_VARIANT: Record<string, "secondary" | "default" | "warning" | "success" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "default",
  APPROVED: "success",
  REJECTED: "destructive",
  EXPIRED: "warning",
};

const INVOICE_STATUS_VARIANT: Record<string, "secondary" | "default" | "warning" | "success" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "default",
  PAID: "success",
  PARTIAL_PAYMENT: "warning",
  OVERDUE: "destructive",
  CANCELLED: "secondary",
};

/** Non-zero {label,value,color} slices for one entity's status breakdown, in STATUS_ORDER's order. */
function slicesFor(byStatus: Record<string, number>, key: DashboardEntityKey): Slice[] {
  return STATUS_ORDER[key]
    .map((s) => ({ label: statusLabel(s), value: byStatus[s] ?? 0, color: STATUS_HEX[s] ?? "#9ca3af" }))
    .filter((s) => s.value > 0);
}

function whenLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return `Today · ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, "h:mm a")}`;
  return format(d, "MMM d · h:mm a");
}

export function UserDashboard({ firstName }: { firstName: string }) {
  const toast = useToast();
  const { filterButton, panel } = useDashboardActivity();
  const [data, setData] = useState<MeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [tasksChartType, setTasksChartType] = useState("donut");
  const [leadsChartType, setLeadsChartType] = useState("bar");
  const [projectsChartType, setProjectsChartType] = useState("column");
  const [quotationsChartType, setQuotationsChartType] = useState("donut");
  const [invoicesChartType, setInvoicesChartType] = useState("bar");

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
      toast.toast({
        title: kind === "check-in" ? "Checked in" : "Checked out",
        variant: "success",
        avatarDataUrl: kind === "check-in" ? "/icons/Check-in.svg" : "/icons/Check-out.svg",
        iconAnimate: true,
      });
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
        <CardContent className="flex flex-col gap-4 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
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
            {filterButton}
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

      {/* Filtered view (period + module), shown when a module is picked. */}
      {panel}

      {/* Overview — the same chart engine the admin dashboard uses, scoped
          to this user's own records, so a quiet day still reads as a shape
          rather than a column of empty boxes. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Your tasks" icon={<IconTasks className="h-4 w-4" />} typeValue={tasksChartType} typeOptions={CHART_TYPES.graph} onType={setTasksChartType}>
          <Chart type={tasksChartType} data={slicesFor(data.charts.tasks, "tasks")} />
        </ChartCard>
        <ChartCard title="Your leads" icon={<IconLeads className="h-4 w-4" />} typeValue={leadsChartType} typeOptions={CHART_TYPES.chart} onType={setLeadsChartType}>
          <Chart type={leadsChartType} data={slicesFor(data.charts.leads, "leads")} />
        </ChartCard>
        <ChartCard title="Your projects" icon={<IconProjects className="h-4 w-4" />} typeValue={projectsChartType} typeOptions={CHART_TYPES.chart} onType={setProjectsChartType}>
          <Chart type={projectsChartType} data={slicesFor(data.charts.projects, "projects")} />
        </ChartCard>
      </div>

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
        <Panel
          title="Your next tasks"
          href="/tasks"
          icon={<IconTasks className="h-4 w-4" />}
          empty={tasks.upcoming.length === 0}
          emptyLabel="No open tasks — nice."
        >
          {tasks.upcoming.map((t) => {
            const overdue = t.dueDate && parseISO(t.dueDate) < new Date();
            return (
              <Link key={t.id} href="/tasks" className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{t.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{pretty(t.status)}</span>
                    <Badge variant={PRIORITY_VARIANT[t.priority] ?? "default"} className="px-1.5 py-0 text-[10px]">
                      {pretty(t.priority)}
                    </Badge>
                  </span>
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
        <Panel
          title="Upcoming meetings"
          href="/meetings"
          icon={<IconCalendar className="h-4 w-4" />}
          empty={meetings.length === 0}
          emptyLabel="Nothing scheduled."
        >
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

        {/* Leads + month attendance + projects */}
        <div className="flex flex-col gap-4">
          <Panel
            title="Recent leads"
            href="/leads"
            icon={<IconLeads className="h-4 w-4" />}
            empty={leads.recent.length === 0}
            emptyLabel="No active leads."
          >
            {leads.recent.map((l) => (
              <Link key={l.id} href="/leads" className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{l.name}</span>
                  {l.company && <span className="block truncate text-xs text-muted-foreground">{l.company}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={PRIORITY_VARIANT[l.priority] ?? "default"} className="px-1.5 py-0 text-[10px]">
                    {pretty(l.priority)}
                  </Badge>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{pretty(l.status)}</span>
                </span>
              </Link>
            ))}
          </Panel>

          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">This month</p>
                <Link href="/attendance" className="text-xs text-primary hover:underline">
                  Attendance
                </Link>
              </div>
              <div className="flex items-center gap-4">
                <AttendanceRing percent={att.monthSummary.attendancePercent} />
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-emerald-500">{att.monthSummary.present} present</span>
                  <span className="text-amber-500">{att.monthSummary.halfDay} half</span>
                  <span className="text-red-500">{att.monthSummary.absent} absent</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Panel
            title={`Your projects (${data.projects.total})`}
            href="/projects"
            icon={<IconProjects className="h-4 w-4" />}
            empty={data.projects.recent.length === 0}
            emptyLabel="No projects yet."
          >
            {data.projects.recent.map((p) => (
              <Link key={p.id} href="/projects" className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                  </span>
                  <ProgressBar value={p.progress} className="mt-1.5" />
                  {p.endDate && <span className="mt-1 block text-xs text-muted-foreground">Due {format(parseISO(p.endDate), "MMM d")}</span>}
                </span>
                <Badge variant={PROJECT_STATUS_VARIANT[p.status] ?? "default"} className="shrink-0">
                  {pretty(p.status)}
                </Badge>
              </Link>
            ))}
          </Panel>
        </div>
      </div>

      {/* CRM Team work — only fetched/shown for a CRM member (or admin). */}
      {data.crm && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IconQuotations className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Your CRM work</h2>
              <p className="text-sm text-muted-foreground">Quotations, invoices, and calls you own.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              href="/quotations"
              icon={<IconQuotations className="h-4 w-4" />}
              label="Open quotations"
              value={data.crm.quotations.open}
              hint={data.crm.quotations.open > 0 ? "Not yet approved" : "All settled"}
            />
            <StatTile
              href="/invoices"
              icon={<IconInvoices className="h-4 w-4" />}
              label="Open invoices"
              value={data.crm.invoices.open}
              hint={data.crm.invoices.open > 0 ? "Awaiting payment" : "All settled"}
              tone={data.crm.invoices.open > 0 ? "primary" : "default"}
            />
          </div>

          {(data.charts.quotations || data.charts.invoices) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {data.charts.quotations && (
                <ChartCard title="Quotations by status" icon={<IconQuotations className="h-4 w-4" />} typeValue={quotationsChartType} typeOptions={CHART_TYPES.graph} onType={setQuotationsChartType}>
                  <Chart type={quotationsChartType} data={slicesFor(data.charts.quotations, "quotations")} height={170} />
                </ChartCard>
              )}
              {data.charts.invoices && (
                <ChartCard title="Invoices by status" icon={<IconInvoices className="h-4 w-4" />} typeValue={invoicesChartType} typeOptions={CHART_TYPES.chart} onType={setInvoicesChartType}>
                  <Chart type={invoicesChartType} data={slicesFor(data.charts.invoices, "invoices")} height={170} />
                </ChartCard>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel
              title="Recent quotations"
              href="/quotations"
              icon={<IconQuotations className="h-4 w-4" />}
              empty={data.crm.quotations.recent.length === 0}
              emptyLabel="No open quotations."
            >
              {data.crm.quotations.recent.map((q) => (
                <Link key={q.id} href="/quotations" className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{q.clientName}</span>
                    <span className="text-xs text-muted-foreground">{q.number}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-xs font-medium tabular-nums">{formatMoney(q.total)}</span>
                    <Badge variant={QUOTATION_STATUS_VARIANT[q.status] ?? "default"} className="px-1.5 py-0 text-[10px]">
                      {pretty(q.status)}
                    </Badge>
                  </span>
                </Link>
              ))}
            </Panel>

            <Panel
              title="Recent invoices"
              href="/invoices"
              icon={<IconInvoices className="h-4 w-4" />}
              empty={data.crm.invoices.recent.length === 0}
              emptyLabel="No open invoices."
            >
              {data.crm.invoices.recent.map((i) => (
                <Link key={i.id} href="/invoices" className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{i.clientName}</span>
                    <span className="text-xs text-muted-foreground">{i.number}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-xs font-medium tabular-nums">{formatMoney(i.total)}</span>
                    <Badge variant={INVOICE_STATUS_VARIANT[i.status] ?? "default"} className="px-1.5 py-0 text-[10px]">
                      {pretty(i.status)}
                    </Badge>
                  </span>
                </Link>
              ))}
            </Panel>

            <Panel
              title="Recent calls"
              href="/calls"
              icon={<IconPhone className="h-4 w-4" />}
              empty={data.crm.calls.length === 0}
              emptyLabel="No calls logged yet."
            >
              {data.crm.calls.map((c) => (
                <Link key={c.id} href="/calls" className="flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-primary/5">
                  <span className="truncate text-sm">{c.clientName}</span>
                  <span className="text-xs text-muted-foreground">
                    {pretty(c.callType)} · {format(parseISO(c.startTime), "MMM d, h:mm a")}
                  </span>
                  {c.nextAction && <span className="truncate text-xs text-primary">Next: {c.nextAction}</span>}
                </Link>
              ))}
            </Panel>
          </div>
        </div>
      )}

      {/* Social Media Team work — only fetched/shown for a Social Media member (or admin). */}
      {data.socialMedia && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IconBuilding className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Your Social Media work</h2>
              <p className="text-sm text-muted-foreground">Clients you own, and content still in progress.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile href="/clients" icon={<IconBuilding className="h-4 w-4" />} label="My clients" value={data.socialMedia.clients} hint="Created by or assigned to you" />
            <StatTile
              href="/clients"
              icon={<IconImage className="h-4 w-4" />}
              label="Content in progress"
              value={data.socialMedia.pendingContent}
              hint={data.socialMedia.pendingContent > 0 ? "Not yet published" : "Nothing pending"}
              tone={data.socialMedia.pendingContent > 0 ? "primary" : "default"}
            />
          </div>

          <Panel
            title="Content pipeline"
            href="/clients"
            icon={<IconImage className="h-4 w-4" />}
            empty={data.socialMedia.content.length === 0}
            emptyLabel="Nothing in progress."
          >
            {data.socialMedia.content.map((c) => (
              <Link key={c.id} href="/clients" className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{c.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.clientName} · {pretty(c.type)}
                    {c.scheduledFor ? ` · ${format(parseISO(c.scheduledFor), "MMM d")}` : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">{pretty(c.stage)}</span>
              </Link>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A small radial progress ring for the attendance %, in place of a plain number. */
function AttendanceRing({ percent }: { percent: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} strokeWidth="6" fill="none" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums">{pct.toFixed(0)}%</span>
    </div>
  );
}

/** A chart card with its own chart-type switcher — the same visual card the admin dashboard uses, fixed to one dataset since this is a personal overview, not an aggregate explorer. */
function ChartCard({
  title,
  icon,
  typeValue,
  typeOptions,
  onType,
  children,
}: {
  title: string;
  icon: ReactNode;
  typeValue: string;
  typeOptions: readonly { value: string; label: string }[];
  onType: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
          {title}
        </span>
        <div className="w-32">
          <Dropdown size="sm" value={typeValue} onChange={onType} options={[...typeOptions]} />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </Card>
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
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
        <CardContent className="flex items-start gap-3 p-4">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              tone === "danger" ? "bg-destructive/10 text-destructive" : tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            {icon}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
            <span className="truncate text-xs text-muted-foreground">{label}</span>
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
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function Panel({
  title,
  href,
  icon,
  children,
  empty,
  emptyLabel,
}: {
  title: string;
  href: string;
  icon?: ReactNode;
  children: ReactNode;
  empty: boolean;
  emptyLabel: string;
}) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          {icon && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>}
          {title}
        </p>
        <Link href={href} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      <CardContent className="p-0">
        {empty ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            {icon && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>}
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/50">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
