"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { endOfDay, format, parseISO, startOfDay, subDays } from "date-fns";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconUsers, IconCheck, IconChevronDown } from "@/components/icons";
import { DASHBOARD_MODULES, type DashboardModuleKey } from "@/lib/dashboard-modules";
import { userDisplayName, userOptionLabel } from "@/lib/user-display";
import { cn } from "@/lib/utils";

type Period = "today" | "yesterday" | "custom" | "range";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "custom", label: "Custom date" },
  { key: "range", label: "Date range" },
];

/** Rows per module card before it scrolls internally rather than growing the grid. */
const CARD_ITEM_LIMIT = 8;

interface DashboardUser {
  id: string;
  name: string;
  surname?: string | null;
  email: string;
  role?: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER" | null;
  avatarDataUrl?: string | null;
}

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string | null;
  date: string | null;
  status: string | null;
  href: string;
}

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function windowFor(period: Period, customDate: string, from: string, to: string): { from?: string; to?: string } | null {
  const now = new Date();
  if (period === "today") return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  if (period === "yesterday") {
    const y = subDays(now, 1);
    return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
  }
  if (period === "custom") {
    if (!customDate) return null;
    const d = parseISO(customDate);
    return { from: startOfDay(d).toISOString(), to: endOfDay(d).toISOString() };
  }
  if (!from || !to) return null;
  return { from: startOfDay(parseISO(from)).toISOString(), to: endOfDay(parseISO(to)).toISOString() };
}

function Avatar({ user }: { user: DashboardUser }) {
  return <UserAvatar name={user.name} avatarDataUrl={user.avatarDataUrl} />;
}

/**
 * One module's card in the per-user view: icon, label, count, and a short,
 * independently-scrolling list so a busy module can't stretch the whole grid
 * taller than the others.
 */
function ModuleCard({
  meta,
  items,
  loading,
}: {
  meta: (typeof DASHBOARD_MODULES)[number];
  items: ActivityItem[] | null;
  loading: boolean;
}) {
  const Icon = meta.icon;
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {meta.label}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{loading ? "…" : (items?.length ?? 0)}</span>
      </div>
      <div className="flex max-h-64 flex-col divide-y divide-border/50 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : !items || items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing in this period.</p>
        ) : (
          items.slice(0, CARD_ITEM_LIMIT).map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-primary/5"
            >
              <span className="min-w-0">
                <span className="block truncate">{it.title}</span>
                {it.subtitle && <span className="block truncate text-xs text-muted-foreground">{it.subtitle}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {it.status && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{pretty(it.status)}</span>
                )}
                {it.date && (
                  <span className="text-[11px] text-muted-foreground">
                    {format(parseISO(it.date), meta.key === "meetings" ? "MMM d · h:mm a" : "MMM d")}
                  </span>
                )}
              </span>
            </Link>
          ))
        )}
        {items && items.length > CARD_ITEM_LIMIT && (
          <p className="px-3 py-1.5 text-center text-[11px] text-muted-foreground">
            +{items.length - CARD_ITEM_LIMIT} more
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Lets an admin drill into one specific person's activity across every
 * module for a chosen day or range — a filter icon that opens a popover with
 * an expandable "User" list (the sub-dropdown) and a period picker.
 *
 * Nothing is fetched until a user is actually picked: `viewingUser` stays
 * null, so the caller (DashboardStats) knows to keep showing the aggregate
 * charts rather than an empty per-user grid.
 */
export function useDashboardUserView() {
  const [open, setOpen] = useState(false);
  const [userListOpen, setUserListOpen] = useState(false);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [customDate, setCustomDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dataByModule, setDataByModule] = useState<Record<DashboardModuleKey, ActivityItem[]> | null>(null);
  const [loading, setLoading] = useState(false);

  // The user list is loaded once, the first time the popover opens — no need
  // to fetch it up front for admins who never touch this filter.
  useEffect(() => {
    if (!open || usersLoaded) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/users/assignable");
      if (!cancelled && res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
      if (!cancelled) setUsersLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, usersLoaded]);

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);
  const win = useMemo(() => windowFor(period, customDate, from, to), [period, customDate, from, to]);

  const fetchAll = useCallback(async () => {
    if (!selectedUserId || !win) {
      setDataByModule(null);
      return;
    }
    setLoading(true);
    try {
      const perModule = await Promise.all(
        DASHBOARD_MODULES.map(async (m) => {
          const params = new URLSearchParams({ module: m.key, userId: selectedUserId });
          if (win.from) params.set("from", win.from);
          if (win.to) params.set("to", win.to);
          const res = await fetch(`/api/dashboard/activity?${params.toString()}`);
          if (!res.ok) return [] as ActivityItem[];
          const data = await res.json();
          return data.items as ActivityItem[];
        })
      );
      const byModule = {} as Record<DashboardModuleKey, ActivityItem[]>;
      DASHBOARD_MODULES.forEach((m, i) => {
        byModule[m.key] = perModule[i];
      });
      setDataByModule(byModule);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, win]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function pickUser(id: string | null) {
    setSelectedUserId(id);
    setUserListOpen(false);
    if (!id) setOpen(false);
  }

  const periodLabel = PERIODS.find((p) => p.key === period)!.label;

  const trigger = (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setUserListOpen(false);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={selectedUser ? `Viewing ${userOptionLabel(selectedUser)}` : "View a user's activity"}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border border-input transition-colors hover:bg-primary/5",
            selectedUserId && "border-primary text-primary"
          )}
        >
          <IconUsers className="h-4 w-4" />
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
                className="z-50 w-72 origin-top-right rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
              >
                <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">User</p>

                {/* Expands in place rather than opening a nested popover — the
                    same sub-dropdown pattern the list-page filters use. */}
                <button
                  type="button"
                  onClick={() => setUserListOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary/5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {selectedUser && <Avatar user={selectedUser} />}
                    <span className={cn("truncate", !selectedUser && "text-muted-foreground")}>
                      {selectedUser ? userOptionLabel(selectedUser) : "Everyone (aggregate view)"}
                    </span>
                  </span>
                  <IconChevronDown
                    className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", userListOpen && "rotate-180")}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {userListOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="max-h-52 overflow-y-auto pb-1">
                        <button
                          type="button"
                          onClick={() => pickUser(null)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-primary/5",
                            !selectedUserId && "bg-accent/60"
                          )}
                        >
                          <span className="text-muted-foreground">Everyone (aggregate view)</span>
                          {!selectedUserId && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        </button>
                        {!usersLoaded && (
                          <div className="flex flex-col gap-1 px-3 py-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-4/5" />
                          </div>
                        )}
                        {users.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => pickUser(u.id)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-primary/5",
                              u.id === selectedUserId && "bg-accent/60"
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar user={u} />
                              <span className="truncate">{userOptionLabel(u)}</span>
                            </span>
                            {u.id === selectedUserId && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {selectedUserId && (
                  <>
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

                    {period === "custom" && (
                      <div className="pt-2">
                        <DatePicker value={customDate} onChange={setCustomDate} clearable={false} />
                      </div>
                    )}
                    {period === "range" && (
                      <div className="pt-2">
                        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );

  const panel = selectedUser ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Avatar user={selectedUser} />
          {userDisplayName(selectedUser)}&apos;s activity · {periodLabel}
        </p>
        <button
          type="button"
          onClick={() => pickUser(null)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Back to overview
        </button>
      </div>
      {!win ? (
        // Custom date / range picked but not finished — five empty-looking
        // cards would read as "no data" rather than "pick a date".
        <Card className="px-4 py-8 text-center text-sm text-muted-foreground">
          {period === "custom" ? "Pick a date." : "Pick a start and end date."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {DASHBOARD_MODULES.map((m) => (
            <ModuleCard key={m.key} meta={m} items={dataByModule?.[m.key] ?? null} loading={loading} />
          ))}
        </div>
      )}
    </div>
  ) : null;

  return { trigger, panel, viewingUser: selectedUser };
}
