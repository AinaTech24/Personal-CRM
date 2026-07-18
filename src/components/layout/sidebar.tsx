"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  IconDashboard,
  IconLeads,
  IconTasks,
  IconProjects,
  IconQuotations,
  IconInvoices,
  IconBuilding,
  IconUsers,
  IconMail,
  IconSettings,
  IconClock,
  IconChevronLeft,
} from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: IconDashboard },
  { href: "/leads", label: "Leads", icon: IconLeads },
  { href: "/tasks", label: "Tasks", icon: IconTasks },
  { href: "/projects", label: "Projects", icon: IconProjects },
  { href: "/quotations", label: "Quotations", icon: IconQuotations },
  { href: "/invoices", label: "Invoices", icon: IconInvoices },
  { href: "/attendance", label: "My Attendance", icon: IconClock },
];

const adminNav: NavItem[] = [
  { href: "/admin/departments", label: "Departments", icon: IconBuilding },
  { href: "/admin/users", label: "Users & Invites", icon: IconUsers },
  { href: "/admin/attendance", label: "Attendance", icon: IconClock },
  { href: "/admin/email", label: "Email (SMTP)", icon: IconMail },
  { href: "/admin/settings", label: "Application", icon: IconSettings },
];

/**
 * Presentational sidebar rail. Its width is driven by the parent grid column
 * (animated via grid-template-columns), so this only fills and clips its column.
 */
export function Sidebar({
  isAdmin,
  collapsed,
  onToggle,
}: {
  isAdmin: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  // Poll pending attendance so the Attendance item can flag new check-ins. Admin only.
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const poll = () =>
      fetch("/api/attendance/pending-count")
        .then((r) => r.json())
        .then((d) => {
          if (active) setPendingCount(d.count ?? 0);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 45_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isAdmin]);

  // Labels stay in the DOM and fade so the grid width can slide without reflowing.
  const labelClass = cn(
    "whitespace-nowrap transition-opacity duration-200",
    collapsed ? "opacity-0" : "opacity-100"
  );

  function renderItem(item: NavItem, active: boolean, badgeCount = 0) {
    return (
      <Tooltip key={item.href} label={collapsed ? item.label : ""} side="right" wrapperClassName="w-full">
        <Link
          href={item.href}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            active && "bg-accent text-foreground"
          )}
        >
          <span className="relative shrink-0">
            <item.icon className="h-4 w-4" />
            {badgeCount > 0 && (
              // Green dot with a blue ping — a new/pending check-in needs attention.
              <span className="absolute -right-1 -top-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
              </span>
            )}
          </span>
          <span className={cn("flex-1", labelClass)}>{item.label}</span>
          {badgeCount > 0 && !collapsed && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              {badgeCount}
            </span>
          )}
        </Link>
      </Tooltip>
    );
  }

  return (
    <aside className="hidden h-screen min-w-0 flex-col overflow-hidden border-r border-border bg-card/40 md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconChevronLeft className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")} />
          </button>
        </Tooltip>
        <Image
          src="/logo.png"
          alt="Aina CRM"
          width={72}
          height={30}
          priority
          unoptimized
          className={cn("h-7 w-auto shrink-0", labelClass)}
        />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
        {mainNav.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return renderItem(item, active);
        })}

        {isAdmin && (
          <>
            <div
              className={cn(
                "mt-4 mb-1 h-4 px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70",
                labelClass
              )}
            >
              Admin
            </div>
            {adminNav.map((item) =>
              renderItem(item, pathname.startsWith(item.href), item.href === "/admin/attendance" ? pendingCount : 0)
            )}
          </>
        )}
      </nav>
    </aside>
  );
}
