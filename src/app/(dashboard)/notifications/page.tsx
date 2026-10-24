"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SkeletonList } from "@/components/ui/skeleton";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { IconBell, IconCheck, IconMail, IconMailCheck, IconTrash } from "@/components/icons";
import {
  notificationVisual,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_CATEGORY_LABEL,
  notificationMessage,
  notificationHref,
  type NotificationLike,
} from "@/lib/notification-format";
import { cn } from "@/lib/utils";

interface Notification extends NotificationLike {
  id: string;
  readAt: string | null;
  createdAt: string;
}

type Tab = "all" | "unread" | "read";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
];

const PAGE_SIZE = 30;

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  ...Object.entries(NOTIFICATION_CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
];

/**
 * The full notification history — the bell only ever shows the latest 30.
 * Tabs filter unread/read, with "Unread" narrowed server-side (via
 * ?unreadOnly=1) so it stays correct regardless of how many pages have been
 * loaded; category, date range, and search are applied client-side over
 * whatever's been fetched so far, same "capped fetch, filter in memory"
 * pattern as the rest of the app's list views (audit logs, activity, etc.).
 */
export default function NotificationsPage() {
  const router = useRouter();
  const { socket } = useSocket();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (tabParam: Tab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: String(PAGE_SIZE) });
      if (tabParam === "unread") params.set("unreadOnly", "1");
      const res = await fetch(`/api/notifications?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load notifications", data.error);
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setHasMore(!!data.hasMore);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  // A new notification arriving live (e.g. from another tab/device acting on
  // one) keeps this page's unread count honest without a manual refresh.
  useEffect(() => {
    if (!socket) return;
    const onNotification = (n: Notification) => {
      setUnreadCount((c) => c + 1);
      if (tab !== "read") setNotifications((prev) => [n, ...prev]);
    };
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, [socket, tab]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ take: String(PAGE_SIZE), skip: String(notifications.length) });
      if (tab === "unread") params.set("unreadOnly", "1");
      const res = await fetch(`/api/notifications?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load more", data.error);
      setNotifications((prev) => [...prev, ...(data.notifications ?? [])]);
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(n: Notification, read: boolean) {
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: read ? new Date().toISOString() : null } : x)));
    setUnreadCount((c) => Math.max(0, c + (read ? -1 : 1)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: n.id, read }),
    });
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  async function dismiss(n: Notification) {
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.readAt) setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications?id=${n.id}`, { method: "DELETE" });
  }

  function openNotification(n: Notification) {
    if (!n.readAt) markRead(n, true);
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromDate = from ? parseISO(from) : null;
    const toDate = to ? parseISO(to) : null;
    return notifications.filter((n) => {
      if (tab === "read" && !n.readAt) return false;
      if (category && NOTIFICATION_CATEGORY[n.type] !== category) return false;
      const created = parseISO(n.createdAt);
      if (fromDate && created < fromDate) return false;
      if (toDate && created > new Date(toDate.getTime() + 24 * 60 * 60 * 1000 - 1)) return false;
      if (q && !notificationMessage(n).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notifications, tab, category, from, to, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Notifications</h1>
          <HelpDialog title="Notifications — help">
            <HelpSection heading="What this page is for">
              <p>Everything you&apos;ve been notified about, in one place — task/lead assignments, mentions, approvals and more. Click one to jump straight to what it&apos;s about. These are personal to you; nobody else sees your notification list.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
          <IconCheck className="h-4 w-4" />
          Mark all as read
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors",
                tab === t.key ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.key === "unread" && unreadCount > 0 && <span className="ml-1.5 text-xs">({unreadCount})</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Dropdown size="sm" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
          </div>
          <div className="w-56">
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          </div>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notifications…" className="w-56" />
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <IconBell className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {notifications.length === 0 ? "You're all caught up" : "Nothing matches these filters"}
            </p>
            {notifications.length === 0 && <p className="text-sm text-muted-foreground">No notifications to show here.</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {filtered.map((n) => {
              const { Icon, badgeClassName, accentClassName } = notificationVisual(n);
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-primary/5",
                    !n.readAt && "bg-accent/30",
                    accentClassName
                  )}
                >
                  <button type="button" onClick={() => openNotification(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", badgeClassName)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{notificationMessage(n)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground" title={format(parseISO(n.createdAt), "dd MMM yyyy, HH:mm")}>
                        {formatDistanceToNow(parseISO(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={n.readAt ? "Mark as unread" : "Mark as read"}
                      onClick={() => markRead(n, !n.readAt)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    >
                      {n.readAt ? <IconMail className="h-4 w-4" /> : <IconMailCheck className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      aria-label="Dismiss"
                      onClick={() => dismiss(n)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!loading && hasMore && (
        <Button type="button" variant="outline" className="self-center" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
