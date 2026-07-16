"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { IconBell, IconCheck, IconTrash, IconLeads, IconProjects, IconQuotations, IconTasks } from "@/components/icons";
import { AnimatePresence, motion } from "framer-motion";
import * as Popover from "@radix-ui/react-popover";
import { useSocket } from "@/components/providers/socket-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  lead_assigned: IconLeads,
  task_assigned: IconTasks,
  task_comment: IconTasks,
  project_member_added: IconProjects,
  project_task_assigned: IconProjects,
  quotation_decided: IconQuotations,
};

function notificationMessage(n: Notification): string {
  const actor = typeof n.payload.actorName === "string" && n.payload.actorName ? n.payload.actorName : "Someone";
  switch (n.type) {
    case "lead_assigned": {
      const leadName = typeof n.payload.leadName === "string" ? n.payload.leadName : "a lead";
      return `${actor} assigned you to the lead "${leadName}"`;
    }
    case "task_assigned": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} assigned you to the task "${taskTitle}"`;
    }
    case "task_comment": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} commented on the task "${taskTitle}"`;
    }
    case "project_member_added": {
      const projectName = typeof n.payload.projectName === "string" ? n.payload.projectName : "a project";
      return `${actor} added you to the project "${projectName}"`;
    }
    case "project_task_assigned": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} assigned you to the project task "${taskTitle}"`;
    }
    case "quotation_decided": {
      const number = typeof n.payload.quotationNumber === "string" ? n.payload.quotationNumber : "a quotation";
      const decision = n.payload.decision === "APPROVED" ? "approved" : "rejected";
      return `${actor} ${decision} quotation ${number}`;
    }
    default:
      return "You have a new update";
  }
}

function notificationHref(n: Notification): string | null {
  if (n.type === "lead_assigned") return "/leads";
  if (n.type === "task_assigned" || n.type === "task_comment") return "/tasks";
  if (n.type === "project_member_added" || n.type === "project_task_assigned") {
    return typeof n.payload.projectId === "string" ? `/projects/${n.payload.projectId}` : "/projects";
  }
  if (n.type === "quotation_decided") return "/quotations";
  return null;
}

export function NotificationBell() {
  const router = useRouter();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => setNotifications(data.notifications ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNotification = (n: Notification) => {
      setNotifications((prev) => [n, ...prev]);
    };
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, [socket]);

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  async function clearAll() {
    setNotifications([]);
    await fetch("/api/notifications", { method: "DELETE" });
  }

  async function markOneRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  function onNotificationClick(n: Notification) {
    if (!n.readAt) markOneRead(n.id);
    const href = notificationHref(n);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip label="Notifications" side="bottom">
        <Popover.Trigger asChild>
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Notifications"
          >
            <IconBell className="h-4 w-4" />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-medium">
              Notifications
              {unreadCount > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({unreadCount} unread)</span>}
            </span>
            <div className="flex items-center gap-0.5">
              <Tooltip label="Mark all as read" side="bottom">
                <button
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                  aria-label="Mark all as read"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <IconCheck className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip label="Clear all" side="bottom">
                <button
                  onClick={clearAll}
                  disabled={notifications.length === 0}
                  aria-label="Clear all"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet</p>
            )}
            {notifications.map((n) => {
              const Icon = NOTIFICATION_ICON[n.type] ?? IconBell;
              return (
                <button
                  key={n.id}
                  onClick={() => onNotificationClick(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                    !n.readAt && "bg-accent/50"
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug">{notificationMessage(n)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
