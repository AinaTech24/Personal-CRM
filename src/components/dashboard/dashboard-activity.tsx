"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { endOfDay, format, parseISO, startOfDay, subDays } from "date-fns";
import { Card } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SkeletonList } from "@/components/ui/skeleton";
import {
  IconFilter,
  IconCheck,
  IconX,
  IconLeads,
  IconTasks,
  IconProjects,
  IconCalendar,
  IconClock,
} from "@/components/icons";
import { cn } from "@/lib/utils";

type ModuleKey = "leads" | "tasks" | "meetings" | "projects" | "attendance";
type Period = "today" | "yesterday" | "upcoming" | "range";

const MODULES: { key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "leads", label: "Leads", icon: IconLeads },
  { key: "tasks", label: "Tasks", icon: IconTasks },
  { key: "meetings", label: "Meetings", icon: IconCalendar },
  { key: "projects", label: "Projects", icon: IconProjects },
  { key: "attendance", label: "Attendance", icon: IconClock },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "upcoming", label: "Upcoming" },
  { key: "range", label: "Date range" },
];

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string | null;
  date: string | null;
  status: string | null;
  href: string;
}

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Turns a period choice into an ISO instant window, in the viewer's own
 * timezone. Upcoming is open-ended (from now on); a custom range needs both
 * ends before it resolves.
 */
function windowFor(period: Period, from: string, to: string): { from?: string; to?: string } | null {
  const now = new Date();
  if (period === "today") return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  if (period === "yesterday") {
    const y = subDays(now, 1);
    return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
  }
  if (period === "upcoming") return { from: now.toISOString() };
  if (!from || !to) return null;
  return { from: startOfDay(parseISO(from)).toISOString(), to: endOfDay(parseISO(to)).toISOString() };
}

/**
 * The dashboard's period + module filter.
 *
 * Returns the trigger button and the results panel as two nodes so a dashboard
 * can drop the button in its header and the panel wherever it wants, while the
 * state and fetching stay here. No module selected → no panel.
 */
export function useDashboardActivity() {
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<ModuleKey | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const win = useMemo(() => windowFor(period, from, to), [period, from, to]);

  const fetchItems = useCallback(async () => {
    if (!module || !win) {
      setItems(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ module });
      if (win.from) params.set("from", win.from);
      if (win.to) params.set("to", win.to);
      const res = await fetch(`/api/dashboard/activity?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [module, win]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const moduleMeta = module ? MODULES.find((m) => m.key === module)! : null;
  const periodLabel = PERIODS.find((p) => p.key === period)!.label;

  const filterButton = (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={module ? `Filter: ${moduleMeta!.label}, ${periodLabel}` : "Filter dashboard"}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm transition-colors hover:bg-primary/5",
            module && "border-primary text-primary"
          )}
        >
          <IconFilter className="h-4 w-4" />
          <span className="hidden sm:inline">{module ? `${moduleMeta!.label} · ${periodLabel}` : "Filter"}</span>
        </button>
      </Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content asChild align="end" sideOffset={6}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="z-50 w-64 origin-top-right rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
              >
                <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">View</p>
                <div className="grid grid-cols-1 gap-0.5">
                  {MODULES.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setModule(m.key)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary/5",
                          module === m.key && "bg-accent/60"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {m.label}
                        </span>
                        {module === m.key && <IconCheck className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>

                <p className="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Period
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPeriod(p.key)}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-sm hover:bg-primary/5",
                        period === p.key ? "bg-primary text-primary-foreground hover:bg-primary" : ""
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {period === "range" && (
                  <div className="pt-2">
                    <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
                  </div>
                )}

                {module && (
                  <button
                    type="button"
                    onClick={() => {
                      setModule(null);
                      setOpen(false);
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-primary/5"
                  >
                    <IconX className="h-3.5 w-3.5" />
                    Clear filter
                  </button>
                )}
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );

  const panel =
    module && moduleMeta ? (
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <moduleMeta.icon className="h-4 w-4 text-muted-foreground" />
            {moduleMeta.label} · {periodLabel}
            {items && <span className="text-xs text-muted-foreground">({items.length})</span>}
          </p>
          <button
            type="button"
            onClick={() => setModule(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
        {loading ? (
          <div className="p-4">
            <SkeletonList rows={4} />
          </div>
        ) : !items || items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {period === "range" && (!from || !to) ? "Pick a start and end date." : `No ${moduleMeta.label.toLowerCase()} in this period.`}
          </p>
        ) : (
          <div className="flex max-h-96 flex-col divide-y divide-border/50 overflow-y-auto">
            {items.map((it) => (
              <Link
                key={it.id}
                href={it.href}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{it.title}</span>
                  {it.subtitle && <span className="block truncate text-xs text-muted-foreground">{it.subtitle}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {it.status && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{pretty(it.status)}</span>
                  )}
                  {it.date && (
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(it.date), module === "meetings" ? "MMM d · h:mm a" : "MMM d")}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    ) : null;

  return { filterButton, panel, active: !!module };
}
