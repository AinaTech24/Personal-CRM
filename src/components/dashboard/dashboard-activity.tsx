"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { endOfDay, format, parseISO, startOfDay, subDays } from "date-fns";
import { Card } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SkeletonList } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconFilter, IconCheck, IconLayoutGrid } from "@/components/icons";
import { DASHBOARD_MODULES, type DashboardModuleKey } from "@/lib/dashboard-modules";
import { cn } from "@/lib/utils";

type ModuleKey = DashboardModuleKey;
type ViewKey = ModuleKey | "all";
type Period = "today" | "yesterday" | "upcoming" | "range";

const MODULES = DASHBOARD_MODULES;

/** Shown first in the view list and selected on load — everything, unfiltered by module. */
const ALL_VIEW = { key: "all" as const, label: "All", icon: IconLayoutGrid };
const VIEWS = [ALL_VIEW, ...MODULES];

/** Cap on the merged "All" feed — each module already caps at 100 server-side,
 *  so five of them could otherwise dump 500 rows into one scrolling list. */
const ALL_VIEW_LIMIT = 60;

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
  user: { name: string; avatarDataUrl: string | null } | null;
}

/** An item plus which module it came from — every item carries this, even
 *  outside the "All" view, so a row never has to guess its own date format
 *  from the view-level state. */
interface FeedItem extends ActivityItem {
  moduleKey: ModuleKey;
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

/** Fetches one module's items for a window and tags each with its module. */
async function fetchModule(key: ModuleKey, win: { from?: string; to?: string }): Promise<FeedItem[]> {
  const params = new URLSearchParams({ module: key });
  if (win.from) params.set("from", win.from);
  if (win.to) params.set("to", win.to);
  const res = await fetch(`/api/dashboard/activity?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items as ActivityItem[]).map((it) => ({ ...it, moduleKey: key }));
}

/**
 * The dashboard's period + module filter.
 *
 * Returns the trigger button and the results panel as two nodes so a
 * dashboard can drop the button in its header and the panel wherever it
 * wants, while the state and fetching stay here.
 *
 * "All" is the resting state — selected on load, showing every module merged
 * into one feed — so the panel is always present rather than appearing only
 * once someone picks a module.
 */
export function useDashboardActivity() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewKey>("all");
  const [period, setPeriod] = useState<Period>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const win = useMemo(() => windowFor(period, from, to), [period, from, to]);

  const fetchItems = useCallback(async () => {
    if (!win) {
      setItems(null);
      return;
    }
    setLoading(true);
    try {
      if (view === "all") {
        const perModule = await Promise.all(MODULES.map((m) => fetchModule(m.key, win)));
        const merged = perModule.flat().sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return b.date.localeCompare(a.date); // newest first
        });
        setItems(merged.slice(0, ALL_VIEW_LIMIT));
      } else {
        setItems(await fetchModule(view, win));
      }
    } finally {
      setLoading(false);
    }
  }, [view, win]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const selectedMeta = view === "all" ? ALL_VIEW : MODULES.find((m) => m.key === view)!;
  const periodLabel = PERIODS.find((p) => p.key === period)!.label;
  const isDefault = view === "all" && period === "today";

  const filterButton = (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Filter: ${selectedMeta.label}, ${periodLabel}`}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border border-input transition-colors hover:bg-primary/5",
            !isDefault && "border-primary text-primary"
          )}
        >
          <IconFilter className="h-4 w-4" />
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
                  {VIEWS.map((v) => {
                    const Icon = v.icon;
                    return (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setView(v.key)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary/5",
                          view === v.key && "bg-accent/60"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {v.label}
                        </span>
                        {view === v.key && <IconCheck className="h-3.5 w-3.5 text-primary" />}
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
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );

  const panel = (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <selectedMeta.icon className="h-4 w-4 text-muted-foreground" />
          {selectedMeta.label} · {periodLabel}
          {items && <span className="text-xs text-muted-foreground">({items.length})</span>}
        </p>
        {!isDefault && (
          <button
            type="button"
            onClick={() => {
              setView("all");
              setPeriod("today");
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
      {loading ? (
        <div className="p-4">
          <SkeletonList rows={4} />
        </div>
      ) : !items || items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {period === "range" && (!from || !to) ? "Pick a start and end date." : "Nothing in this period."}
        </p>
      ) : (
        // Capped a little shorter than a full list would want, so the metric
        // cards below are visibly there rather than pushed under the fold.
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">User</th>
                {view === "all" && <th className="px-4 py-2 font-medium">Type</th>}
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const itemMeta = MODULES.find((m) => m.key === it.moduleKey)!;
                const ItemIcon = itemMeta.icon;
                return (
                  <tr
                    key={`${it.moduleKey}-${it.id}`}
                    onClick={() => router.push(it.href)}
                    className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-primary/5"
                  >
                    <td className="max-w-0 px-4 py-2.5">
                      <span className="block truncate">{it.title}</span>
                      {it.subtitle && <span className="block truncate text-xs text-muted-foreground">{it.subtitle}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {it.user ? (
                        <span className="flex items-center gap-2">
                          <UserAvatar name={it.user.name} avatarDataUrl={it.user.avatarDataUrl} />
                          <span className="truncate">{it.user.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    {view === "all" && (
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                          {itemMeta.label}
                        </span>
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {it.date ? format(parseISO(it.date), it.moduleKey === "meetings" ? "MMM d · h:mm a" : "MMM d") : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {it.status && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{pretty(it.status)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  return { filterButton, panel, active: !isDefault };
}
