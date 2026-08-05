"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { SkeletonCards } from "@/components/ui/skeleton";
import {
  IconLeads,
  IconTasks,
  IconProjects,
  IconQuotations,
  IconInvoices,
  IconUsers,
} from "@/components/icons";
import { useSocket } from "@/components/providers/socket-provider";
import { Chart, CHART_TYPES, type Slice } from "@/components/dashboard/charts";
import { useDashboardActivity } from "@/components/dashboard/dashboard-activity";
import { useDashboardUserView } from "@/components/dashboard/dashboard-user-view";

interface EntityStat {
  total: number;
  byStatus: Record<string, number>;
}

interface Stats {
  users: { total: number; admins: number; departmentUsers: number; active: number; inactive: number };
  leads: EntityStat;
  tasks: EntityStat;
  projects: EntityStat;
  quotations: EntityStat;
  invoices: EntityStat;
}

type EntityKey = "leads" | "tasks" | "projects" | "quotations" | "invoices";

function label(status: string) {
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const HEX = {
  primary: "#dc2626",
  indigo: "#f87171",
  emerald: "#10b981",
  amber: "#f59e0b",
  amberLight: "#fbbf24",
  red: "#ef4444",
  gray: "#9ca3af",
};

const STATUS_HEX: Record<string, string> = {
  NEW: HEX.primary, CONTACTED: HEX.indigo, MEETING: HEX.indigo, QUALIFIED: HEX.emerald, PROPOSAL_SENT: HEX.amber,
  NEGOTIATION: HEX.amberLight, WON: HEX.emerald, LOST: HEX.red,
  TODO: HEX.gray, IN_PROGRESS: HEX.amber, REVIEW: HEX.primary, COMPLETED: HEX.emerald, CANCELLED: HEX.red,
  PLANNED: HEX.gray, ACTIVE: HEX.emerald, ON_HOLD: HEX.amber,
  DRAFT: HEX.gray, SENT: HEX.primary, APPROVED: HEX.emerald, REJECTED: HEX.red, EXPIRED: HEX.amber,
  PAID: HEX.emerald, PARTIAL_PAYMENT: HEX.amber, OVERDUE: HEX.red,
};

const STATUS_ORDER: Record<EntityKey, string[]> = {
  leads: ["NEW", "CONTACTED", "MEETING", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"],
  tasks: ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"],
  projects: ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"],
  quotations: ["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"],
  invoices: ["DRAFT", "SENT", "PAID", "PARTIAL_PAYMENT", "OVERDUE", "CANCELLED"],
};

const ENTITY_META: { key: EntityKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "leads", label: "Leads", icon: IconLeads },
  { key: "tasks", label: "Tasks", icon: IconTasks },
  { key: "projects", label: "Projects", icon: IconProjects },
  { key: "quotations", label: "Quotations", icon: IconQuotations },
  { key: "invoices", label: "Invoices", icon: IconInvoices },
];

/** Non-zero {label,value,color} slices for a chartable dataset. */
function slicesFor(stats: Stats, key: EntityKey | "users"): Slice[] {
  if (key === "users") {
    return [
      { label: "Admins", value: stats.users.admins, color: HEX.primary },
      { label: "Department", value: stats.users.departmentUsers, color: HEX.emerald },
      { label: "Active", value: stats.users.active, color: HEX.emerald },
      { label: "Inactive", value: stats.users.inactive, color: HEX.red },
    ].filter((s) => s.value > 0);
  }
  const e = stats[key];
  return STATUS_ORDER[key]
    .map((s) => ({ label: label(s), value: e.byStatus[s] ?? 0, color: STATUS_HEX[s] ?? HEX.gray }))
    .filter((s) => s.value > 0);
}

const DATASET_OPTIONS = [
  { value: "leads", label: "Leads" },
  { value: "tasks", label: "Tasks" },
  { value: "projects", label: "Projects" },
  { value: "quotations", label: "Quotations" },
  { value: "invoices", label: "Invoices" },
  { value: "users", label: "Users" },
];

interface MetricOption {
  value: string;
  label: string;
  count: number;
}

/** Compact stat card with a dropdown that switches which figure the big number shows. */
function MetricCard({
  title,
  icon: Icon,
  options,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  options: MetricOption[];
}) {
  const [sel, setSel] = useState(options[0]?.value ?? "total");
  const current = options.find((o) => o.value === sel) ?? options[0];

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="text-3xl font-semibold tabular-nums">{current?.count ?? 0}</div>
      <Dropdown size="sm" value={sel} onChange={setSel} options={options.map((o) => ({ value: o.value, label: o.label }))} />
    </Card>
  );
}

/** Chart card with a title, a chart-type selector and a dataset selector. */
function ChartCard({
  title,
  typeValue,
  typeOptions,
  onType,
  dataset,
  onDataset,
  children,
}: {
  title: string;
  typeValue: string;
  typeOptions: readonly { value: string; label: string }[];
  onType: (v: string) => void;
  dataset: string;
  onDataset: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-1.5">
          <div className="w-32">
            <Dropdown size="sm" value={typeValue} onChange={onType} options={[...typeOptions]} />
          </div>
          <div className="w-28">
            <Dropdown size="sm" value={dataset} onChange={onDataset} options={DATASET_OPTIONS} />
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </Card>
  );
}

export function DashboardStats({ greetingName = "" }: { greetingName?: string }) {
  const router = useRouter();
  const { socket } = useSocket();
  // This component only renders for admins (see the dashboard page's own
  // check), so the filter's Quotations/Invoices views are always offered here.
  const { filterButton, departmentFilterButton, panel, department } = useDashboardActivity(true);
  const { trigger: userViewTrigger, panel: userViewPanel, viewingUser } = useDashboardUserView();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [chartType, setChartType] = useState("bar");
  const [chartDataset, setChartDataset] = useState("leads");
  const [graphType, setGraphType] = useState("donut");
  const [graphDataset, setGraphDataset] = useState("tasks");
  const [nodeType, setNodeType] = useState("bubble");
  const [nodeDataset, setNodeDataset] = useState("invoices");

  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (department) params.set("department", department);
        const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        } else if (res.status === 403) {
          router.replace("/leads");
        }
      } finally {
        if (initial) setLoading(false);
      }
    },
    [router, department]
  );

  useEffect(() => {
    // Not "initial" after the very first load — a department change should
    // swap the numbers in place, not flash the full skeleton grid again.
    load(stats === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Live refresh: any create/update/delete anywhere in the app re-pulls the counts.
  useEffect(() => {
    if (!socket) return;
    const events = [
      "lead_created", "lead_updated", "lead_deleted",
      "task_created", "task_updated", "task_deleted",
      "project_created", "project_updated", "project_deleted",
      "quotation_created", "quotation_updated", "quotation_deleted",
      "invoice_created", "invoice_updated", "invoice_deleted",
      "user_created", "user_updated", "user_deleted",
    ];
    const handler = () => load(false);
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
  }, [socket, load]);

  const metricCards = useMemo(() => {
    if (!stats) return [];
    const userOpts: MetricOption[] = [
      { value: "total", label: "All users", count: stats.users.total },
      { value: "admins", label: "Admins", count: stats.users.admins },
      { value: "dept", label: "Department", count: stats.users.departmentUsers },
      { value: "active", label: "Active", count: stats.users.active },
      { value: "inactive", label: "Inactive", count: stats.users.inactive },
    ];
    const entityCards = ENTITY_META.map((m) => {
      const e = stats[m.key];
      const opts: MetricOption[] = [
        { value: "total", label: "Total", count: e.total },
        ...STATUS_ORDER[m.key].map((s) => ({ value: s, label: label(s), count: e.byStatus[s] ?? 0 })),
      ];
      return { title: m.label, icon: m.icon, options: opts };
    });
    return [{ title: "Users", icon: IconUsers, options: userOpts }, ...entityCards];
  }, [stats]);

  const header = (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back{greetingName ? `, ${greetingName}` : ""} — live overview across all modules
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {departmentFilterButton}
          {filterButton}
          {userViewTrigger}
        </div>
      </div>
      {panel}
    </div>
  );

  if (loading || !stats) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        {header}
        <SkeletonCards count={4} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {header}
      {/* Metric cards — one row on wide screens, each with its own dropdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((c) => (
          <MetricCard key={c.title} title={c.title} icon={c.icon} options={c.options} />
        ))}
      </div>

      {/* Drilled into one person's activity: the aggregate charts below don't
          apply to a single user, so their card grid takes this spot instead
          until the Users filter is cleared. */}
      {viewingUser ? (
        userViewPanel
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Chart"
            typeValue={chartType}
            typeOptions={CHART_TYPES.chart}
            onType={setChartType}
            dataset={chartDataset}
            onDataset={setChartDataset}
          >
            <Chart type={chartType} data={slicesFor(stats, chartDataset as EntityKey | "users")} />
          </ChartCard>
          <ChartCard
            title="Graph"
            typeValue={graphType}
            typeOptions={CHART_TYPES.graph}
            onType={setGraphType}
            dataset={graphDataset}
            onDataset={setGraphDataset}
          >
            <Chart type={graphType} data={slicesFor(stats, graphDataset as EntityKey | "users")} />
          </ChartCard>
          <ChartCard
            title="Nodes"
            typeValue={nodeType}
            typeOptions={CHART_TYPES.nodes}
            onType={setNodeType}
            dataset={nodeDataset}
            onDataset={setNodeDataset}
          >
            <Chart type={nodeType} data={slicesFor(stats, nodeDataset as EntityKey | "users")} />
          </ChartCard>
        </div>
      )}
    </div>
  );
}
