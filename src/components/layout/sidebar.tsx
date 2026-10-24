"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconDashboard,
  IconLeads,
  IconTasks,
  IconProjects,
  IconMessage,
  IconQuotations,
  IconInvoices,
  IconBuilding,
  IconMail,
  IconClock,
  IconChevronLeft,
  IconGrid,
  IconHistory,
  IconUsers,
  IconPhone,
  IconKey,
  IconCake,
  IconWallet,
  IconCalendar,
  IconLayoutGrid,
  IconShield,
  IconSliders,
  IconCheck,
  IconSearch,
  IconX,
  IconNotes,
} from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocket } from "@/components/providers/socket-provider";
import type { ManagedModule } from "@/lib/module-permissions";
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
  { href: "/meetings", label: "Meetings", icon: IconCalendar },
  { href: "/messages", label: "Messages", icon: IconMessage },
  { href: "/notes", label: "Notes", icon: IconNotes },
  { href: "/quotations", label: "Quotations", icon: IconQuotations },
  { href: "/invoices", label: "Invoices", icon: IconInvoices },
  { href: "/passwords", label: "Password Manager", icon: IconKey },
  { href: "/birthdays", label: "Birthdays", icon: IconCake },
  { href: "/attendance", label: "My Attendance", icon: IconClock },
  { href: "/leave", label: "My Leave", icon: IconCalendar },
  { href: "/expenses", label: "My Expenses", icon: IconWallet },
  { href: "/activity", label: "My Activity", icon: IconHistory },
];

const adminNav: NavItem[] = [
  { href: "/admin/modules", label: "Modules", icon: IconGrid },
  { href: "/admin/logs", label: "View logs", icon: IconHistory },
  { href: "/admin/departments", label: "Departments", icon: IconBuilding },
  { href: "/admin/users", label: "Users & Invites", icon: IconUsers },
  { href: "/admin/permissions", label: "Permission Manager", icon: IconShield },
  { href: "/admin/birthdays", label: "Birthday Settings", icon: IconCake },
  { href: "/teams", label: "Teams", icon: IconUsers },
  { href: "/admin/attendance", label: "Attendance", icon: IconClock },
  { href: "/admin/leave", label: "Leave Requests", icon: IconCalendar },
  { href: "/admin/expenses", label: "Expense Requests", icon: IconWallet },
  { href: "/admin/clients", label: "Client Accounts", icon: IconBuilding },
  { href: "/forms", label: "Forms", icon: IconLayoutGrid },
  { href: "/admin/email", label: "Email (SMTP)", icon: IconMail },
];

/**
 * A team member (regular or lead, not a company admin) still needs some way
 * to reach their own client list day to day even without the admin nav's
 * "Social Media Team" link above, so this one link survives for them
 * specifically.
 */
const clientsNavItem: NavItem = { href: "/clients", label: "Clients", icon: IconBuilding };

/**
 * A non-admin lead's own way into the same Team console an Admin/Super Admin
 * reaches via adminNav's "Social Media Team" entry above — a regular
 * (non-lead) team member doesn't manage the team, so they don't get this.
 */
const teamNavItem: NavItem = { href: "/social-media/team", label: "Social Media Team", icon: IconUsers };

/** Modules a Social Media team member (regular or lead) never sees, even if an admin hasn't globally hidden them. */
const SOCIAL_MEDIA_EXCLUDED_HREFS = ["/quotations"];

/**
 * A CRM team member's way into the call log — unlike Social Media, CRM isn't
 * a separate curated line of business (they still need Quotations, Invoices,
 * etc.), so this is purely additive rather than replacing anything.
 */
const callsNavItem: NavItem = { href: "/calls", label: "Calls", icon: IconPhone };

/** A non-admin CRM lead's own way into the CRM Team console — mirrors teamNavItem above. */
const crmTeamNavItem: NavItem = { href: "/crm/team", label: "CRM Team", icon: IconUsers };

/** A non-admin user whose department was shared on at least one form — mirrors adminNav's own entry at the same href. */
const formsNavItem: NavItem = { href: "/forms", label: "Forms", icon: IconLayoutGrid };

/**
 * Which adminNav entries an individually-granted module permission (not
 * company-admin) can unlock, and the module that unlocks each — Leave and
 * Attendance live under /admin for everyone, so this is how a Support
 * Executive-style grant reaches them without becoming a full Admin. Tasks,
 * Meetings, Leads, Projects, Messages already have their own always-visible
 * top-level nav entry above; Clients is handled separately below since its
 * non-admin page lives at /clients, not /admin/clients.
 */
const MODULE_ADMIN_HREFS: Partial<Record<ManagedModule, string>> = {
  LEAVE: "/admin/leave",
  ATTENDANCE: "/admin/attendance",
  BIRTHDAYS: "/admin/birthdays",
  EXPENSES: "/admin/expenses",
};
const ADMIN_HREF_MODULE = new Map<string, ManagedModule>(
  (Object.entries(MODULE_ADMIN_HREFS) as [ManagedModule, string][]).map(([module, href]) => [href, module])
);

/**
 * The subset of mainNav hrefs an admin can also globally hide (Admin >
 * Application's module-visibility toggles) that overlap with a module the
 * Permission Manager can grant. Without this, hiding "Leads" company-wide
 * and then granting someone individual Leads access would still never show
 * them the nav link — the hide would silently win with no indication of why
 * in either admin screen. An explicit grant now wins, same as Clients
 * already does below.
 */
const MAIN_NAV_HREF_MODULE: Partial<Record<string, ManagedModule>> = {
  "/leads": "LEADS",
  "/tasks": "TASKS",
  "/projects": "PROJECTS",
  "/meetings": "MEETINGS",
  "/attendance": "ATTENDANCE",
};

/**
 * Every nav href a Permission Manager "block" (ModulePermissionFlags.blocked)
 * can hide outright for one person — a superset of MAIN_NAV_HREF_MODULE
 * above (that one only covers the grant-override case for the base mainNav
 * filter; Clients isn't even part of mainNav to begin with, since it's
 * always spliced in separately). Applied once, after every insertion path
 * has run, so it catches a blocked module regardless of why it was added —
 * default visibility, team membership, or an individual grant.
 */
const BLOCKABLE_HREF_MODULE: Partial<Record<string, ManagedModule>> = {
  "/leads": "LEADS",
  "/tasks": "TASKS",
  "/projects": "PROJECTS",
  "/meetings": "MEETINGS",
  "/attendance": "ATTENDANCE",
  "/leave": "LEAVE",
  "/birthdays": "BIRTHDAYS",
  "/messages": "MESSAGES",
  "/clients": "CLIENTS",
  "/expenses": "EXPENSES",
};

function NavLinkItem({
  item,
  active,
  badgeCount = 0,
  tone = "attention",
  collapsed,
  labelClass,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  badgeCount?: number;
  tone?: "attention" | "count";
  collapsed: boolean;
  labelClass: string;
  onNavigate?: () => void;
}) {
  // Unread messages are a running tally, not something needing triage, so they
  // get a plain count pill rather than the pinging "look at me" dot.
  const isCount = tone === "count";
  return (
    <Tooltip
      label={collapsed ? (badgeCount > 0 ? `${item.label} (${badgeCount})` : item.label) : ""}
      side="right"
      wrapperClassName="w-full"
    >
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary",
          active && "bg-primary/5 text-primary"
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="h-5 w-5" />
          {badgeCount > 0 &&
            (isCount ? (
              // Collapsed, the rail is too narrow for a number, so the icon
              // carries a dot instead — the tooltip still gives the count.
              collapsed && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
              )
            ) : (
              <span className="absolute -right-1 -top-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
              </span>
            ))}
        </span>
        <span className={cn("flex-1", labelClass)}>{item.label}</span>
        {badgeCount > 0 && !collapsed && (
          <span
            className={cn(
              "min-w-5 rounded-full px-1.5 text-center text-[10px] font-semibold tabular-nums",
              isCount
                ? "bg-primary text-primary-foreground"
                : "bg-emerald-500/15 font-medium text-emerald-600 dark:text-emerald-400"
            )}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

const NAV_ORDER_KEY = "aina-sidebar-nav-order";

/** A per-browser layout preference, same storage mechanism as the collapsed state right below — not synced across devices, nothing to lose by keeping it purely local. */
function loadNavOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : null;
  } catch {
    return null;
  }
}

function saveNavOrder(order: string[]) {
  try {
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Private browsing / storage blocked — the reorder still works for this
    // session, it just won't be remembered next time.
  }
}

/**
 * Applies a remembered order (a list of hrefs) to the nav items actually
 * visible right now. Items from the saved order that are still visible come
 * first, in that order; anything else (a module just granted, or the
 * remembered order predating it) falls in afterward, in its natural
 * position — so a stale or partial preference never hides anything, it just
 * doesn't get positioned by it.
 */
function applyNavOrder(items: NavItem[], order: string[] | null): NavItem[] {
  if (!order || order.length === 0) return items;
  const remaining = new Map(items.map((i) => [i.href, i]));
  const ordered: NavItem[] = [];
  for (const href of order) {
    const item = remaining.get(href);
    if (item) {
      ordered.push(item);
      remaining.delete(href);
    }
  }
  for (const item of items) {
    if (remaining.has(item.href)) ordered.push(item);
  }
  return ordered;
}

/** A nav row with an optional drag handle — the handle only exists (and only then accepts pointer input) while actively rearranging, so the row behaves like a plain link the rest of the time. */
function SortableNavItem({
  item,
  rearranging,
  ...rest
}: {
  item: NavItem;
  rearranging: boolean;
  active: boolean;
  badgeCount?: number;
  tone?: "attention" | "count";
  collapsed: boolean;
  labelClass: string;
  onNavigate?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.href,
    disabled: !rearranging,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-center gap-1", isDragging && "relative z-10 opacity-60")}>
      {rearranging && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag to reorder ${item.label}`}
        >
          <IconGrid className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <NavLinkItem item={item} {...rest} />
      </div>
    </div>
  );
}

/**
 * Presentational sidebar rail. Its width is driven by the parent grid column
 * (animated via grid-template-columns), so this only fills and clips its column.
 */
export function Sidebar({
  isAdmin,
  isDepartmentAdmin,
  restrictToSocialMedia,
  isSocialMediaLead,
  hasCrmAccess,
  isCrmLead,
  canViewForms,
  managedModules,
  collapsed,
  onToggle,
  /** Rendered inside the mobile drawer: always visible, always expanded. */
  mobile = false,
  onNavigate,
}: {
  isAdmin: boolean;
  isDepartmentAdmin: boolean;
  restrictToSocialMedia: boolean;
  isSocialMediaLead: boolean;
  hasCrmAccess: boolean;
  isCrmLead: boolean;
  canViewForms: boolean;
  managedModules: ManagedModule[];
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const managedModuleSet = new Set(managedModules);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [pendingExpenses, setPendingExpenses] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [blockedModules, setBlockedModules] = useState<string[]>([]);
  // Admins see every module, so their nav is correct on first paint. Everyone
  // else has to wait for the visibility list — without this the full nav
  // renders and then items vanish as the answer arrives.
  const [navReady, setNavReady] = useState(isAdmin);
  const [rearranging, setRearranging] = useState(false);
  const [navOrder, setNavOrder] = useState<string[] | null>(null);
  const [navSearch, setNavSearch] = useState("");
  const { socket } = useSocket();
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    setNavOrder(loadNavOrder());
  }, []);

  // Collapsing mid-rearrange would hide the toggle that turns it back off,
  // with no room for drag handles anyway — so collapsing always exits it.
  // The search input itself disappears when collapsed (replaced by a plain
  // expand button), so there'd be no way left to clear a leftover query.
  useEffect(() => {
    if (collapsed) {
      setRearranging(false);
      setNavSearch("");
    }
  }, [collapsed]);

  // Which modules an admin has hidden from regular users. Admins see everything.
  useEffect(() => {
    if (isAdmin) return;
    let active = true;
    // A slow (not failed) response left the nav stuck in skeleton
    // indefinitely — fetch() only rejects on an actual network error, never
    // on taking a while, so a sluggish backend (e.g. right after a deploy
    // restart) had nothing to time it out. Bounding it means the nav always
    // resolves one way or the other within a few seconds.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    fetch("/api/module-visibility", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setHiddenModules(Array.isArray(d.hiddenModules) ? d.hiddenModules : []);
        setBlockedModules(Array.isArray(d.blockedModules) ? d.blockedModules : []);
      })
      .catch(() => {})
      .finally(() => {
        // Ready either way: a failed or timed-out fetch shows the full nav rather than none.
        clearTimeout(timeout);
        if (active) setNavReady(true);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isAdmin]);

  let visibleMainNav = isAdmin
    ? [...mainNav]
    : mainNav.filter((item) => {
        // "My Activity" is a personal record of one's own actions, not a
        // toggleable module — an admin hiding it would just be hiding the
        // one place a regular user can see their own history. Notes is the
        // same kind of always-available personal space, with its own fixed
        // 3-tier visibility (see src/lib/notes.ts) rather than a Permission
        // Manager grant, so there's nothing here for an admin to hide either.
        if (item.href === "/" || item.href === "/activity" || item.href === "/notes") return true;
        if (!hiddenModules.includes(item.href.replace(/^\//, ""))) return true;
        const grantedModule = MAIN_NAV_HREF_MODULE[item.href];
        return !!grantedModule && managedModuleSet.has(grantedModule);
      });

  // Social Media team members (regular or lead, not a company admin) don't
  // get Quotations — enforced server-side too, independent of the sidebar —
  // and get "Clients" (their own name for the same SocialClient records)
  // right after Leads, so they have a way back into their own work. A lead
  // additionally gets the Team console link itself, right after Clients.
  if (restrictToSocialMedia) {
    visibleMainNav = visibleMainNav.filter((item) => !SOCIAL_MEDIA_EXCLUDED_HREFS.includes(item.href));
    const leadsIndex = visibleMainNav.findIndex((item) => item.href === "/leads");
    const insertAt = leadsIndex === -1 ? visibleMainNav.length : leadsIndex + 1;
    visibleMainNav.splice(insertAt, 0, ...(isSocialMediaLead ? [clientsNavItem, teamNavItem] : [clientsNavItem]));
  }

  // CRM team members (regular or lead, not a company admin) keep the rest of
  // the standard nav — CRM isn't a separate curated line of business the way
  // Social Media is — and just gain "Calls" right after Leads, plus a
  // read-only "Clients" (see crmClientsScopeFor) unless an admin has hidden
  // that module company-wide. A lead additionally gets the Team console
  // link itself, right after those.
  if (hasCrmAccess && !isAdmin) {
    const leadsIndex = visibleMainNav.findIndex((item) => item.href === "/leads");
    const insertAt = leadsIndex === -1 ? visibleMainNav.length : leadsIndex + 1;
    const crmExtras = [callsNavItem, ...(hiddenModules.includes("clients") ? [] : [clientsNavItem]), ...(isCrmLead ? [crmTeamNavItem] : [])];
    visibleMainNav.splice(insertAt, 0, ...crmExtras);
  }

  // A department shared on at least one form (or a department admin) gets
  // their own way into Forms, not a company admin who already sees this
  // via adminNav.
  if (canViewForms && !isAdmin) {
    visibleMainNav.push(formsNavItem);
  }

  // Someone granted the Clients module permission gets the same "Clients" link
  // a Social Media team member has — unless they already got it above (a
  // Social Media member who also holds the grant shouldn't see it twice).
  //
  // Unlike Leads/Tasks/Projects/Meetings/Attendance (MAIN_NAV_HREF_MODULE,
  // above), the global hide wins over the grant here rather than the other
  // way round: those modules are shown to everyone by default and a grant
  // only widens one person's own-record scope, so "an explicit grant now
  // wins" was the fix for a hide silently undoing that widening. Clients was
  // never shown by default to begin with — it only ever appears via a grant
  // or CRM/Social Media team membership — so the hide toggle here instead
  // works as the admin's one on/off switch over the grant-based path
  // specifically (Social Media's own members are unaffected either way).
  if (
    !isAdmin &&
    managedModuleSet.has("CLIENTS") &&
    !hiddenModules.includes("clients") &&
    !visibleMainNav.some((item) => item.href === "/clients")
  ) {
    const leadsIndex = visibleMainNav.findIndex((item) => item.href === "/leads");
    visibleMainNav.splice(leadsIndex === -1 ? visibleMainNav.length : leadsIndex + 1, 0, clientsNavItem);
  }

  // A Permission Manager "block" hides a module's nav link for this one
  // person outright, regardless of why it would otherwise be visible —
  // default, team membership, or a grant. Never applies to an admin.
  if (!isAdmin && blockedModules.length > 0) {
    visibleMainNav = visibleMainNav.filter((item) => {
      const blockableModule = BLOCKABLE_HREF_MODULE[item.href];
      return !blockableModule || !blockedModules.includes(blockableModule);
    });
  }

  // The user's own drag-to-reorder preference, applied last so it works on
  // whatever ended up actually visible for them — never hides or adds
  // anything, purely repositions.
  visibleMainNav = applyNavOrder(visibleMainNav, navOrder);

  // Leave/Attendance/Birthdays each have an /admin page a module grant can
  // unlock without making the holder a full Admin — everything else granted
  // (Tasks, Meetings, Leads, Projects, Messages) already has its own
  // always-visible top-level nav entry above. A Department Admin additionally
  // gets the Permission Manager link, the one /admin page their own flag
  // (not a module grant) unlocks.
  let grantedAdminNav = isAdmin
    ? adminNav
    : adminNav.filter((item) => {
        if (item.href === "/admin/permissions") return isDepartmentAdmin;
        const grantedModule = ADMIN_HREF_MODULE.get(item.href);
        return !!grantedModule && managedModuleSet.has(grantedModule) && !blockedModules.includes(grantedModule);
      });

  // Same drag-to-reorder preference as Main — applied last so it works on
  // whatever ended up actually visible for them.
  grantedAdminNav = applyNavOrder(grantedAdminNav, navOrder);

  // The sidebar's own search capsule filters the modules already visible to
  // this user — it's a local nav filter, not the global Ctrl+K search, so it
  // never has to hit the network or show results outside the sidebar.
  const navSearchQuery = navSearch.trim().toLowerCase();
  const searchedMainNav = navSearchQuery
    ? visibleMainNav.filter((item) => item.label.toLowerCase().includes(navSearchQuery))
    : visibleMainNav;
  const searchedAdminNav = navSearchQuery
    ? grantedAdminNav.filter((item) => item.label.toLowerCase().includes(navSearchQuery))
    : grantedAdminNav;
  const navSearchHasResults = searchedMainNav.length > 0 || searchedAdminNav.length > 0;

  // Unread chat messages, for the badge on Messages. Driven by the socket so it
  // reacts the moment something arrives; the poll is a backstop for a dropped
  // connection or a read that happened in another tab.
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/messages/unread-count")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d) setUnreadMessages(d.total ?? 0);
        })
        .catch(() => {});

    load();
    const id = setInterval(load, 60_000);

    if (socket) {
      // "message" fires for our own sends too, and "read" only tells us the
      // clock moved — in both cases the server holds the truth, so re-ask.
      socket.on("message", load);
      socket.on("read", load);
      socket.on("conversation:deleted", load);
    }
    // Coming back to the tab, the count may have moved while we were away.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      if (socket) {
        socket.off("message", load);
        socket.off("read", load);
        socket.off("conversation:deleted", load);
      }
    };
  }, [socket]);

  // Opening a chat clears its unread state, but that happens inside the chat
  // view — refresh when the route changes so the badge doesn't lag behind.
  useEffect(() => {
    if (!pathname.startsWith("/messages")) return;
    const t = setTimeout(() => {
      fetch("/api/messages/unread-count")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setUnreadMessages(d.total ?? 0))
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [pathname]);

  const canSeeAttendanceAdmin = isAdmin || managedModuleSet.has("ATTENDANCE");
  const canSeeLeaveAdmin = isAdmin || managedModuleSet.has("LEAVE");
  const canSeeExpensesAdmin = isAdmin || managedModuleSet.has("EXPENSES");

  // Poll pending attendance so the Attendance item can flag new check-ins.
  useEffect(() => {
    if (!canSeeAttendanceAdmin) return;
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
  }, [canSeeAttendanceAdmin]);

  // Same for leave requests waiting on a decision.
  useEffect(() => {
    if (!canSeeLeaveAdmin) return;
    let active = true;
    const poll = () =>
      fetch("/api/leave-requests/pending-count")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d) setPendingLeave(d.count ?? 0);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 45_000);
    if (socket) socket.on("leave_request_changed", poll);
    return () => {
      active = false;
      clearInterval(id);
      if (socket) socket.off("leave_request_changed", poll);
    };
  }, [canSeeLeaveAdmin, socket]);

  // Same for expense claims waiting on a decision.
  useEffect(() => {
    if (!canSeeExpensesAdmin) return;
    let active = true;
    const poll = () =>
      fetch("/api/expenses/pending-count")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d) setPendingExpenses(d.count ?? 0);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 45_000);
    if (socket) socket.on("expense_request_changed", poll);
    return () => {
      active = false;
      clearInterval(id);
      if (socket) socket.off("expense_request_changed", poll);
    };
  }, [canSeeExpensesAdmin, socket]);

  // Labels stay in the DOM and fade so the grid width can slide without reflowing.
  const labelClass = cn(
    "whitespace-nowrap transition-opacity duration-200",
    collapsed ? "opacity-0" : "opacity-100"
  );

  // Main nav and Admin nav are reordered independently — they're separate
  // permission-gated groups with their own heading, so a drag only ever
  // moves an item within the group it started in. Both groups' positions
  // live in the same saved order list; applyNavOrder() already filters that
  // list down to whichever items are actually in play for a given group.
  function handleNavDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const inMain = visibleMainNav.some((i) => i.href === active.id);
    const list = inMain ? visibleMainNav : grantedAdminNav;
    const oldIndex = list.findIndex((i) => i.href === active.id);
    const newIndex = list.findIndex((i) => i.href === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedHrefs = arrayMove(list, oldIndex, newIndex).map((i) => i.href);
    const otherHrefs = (inMain ? grantedAdminNav : visibleMainNav).map((i) => i.href);
    const combined = inMain ? [...reorderedHrefs, ...otherHrefs] : [...otherHrefs, ...reorderedHrefs];
    setNavOrder(combined);
    saveNavOrder(combined);
  }

  return (
    <aside
      className={cn(
        // Padding (not margin) keeps the fill edge-to-edge under the notch and
        // home indicator while the logo, nav and toggle stay clear of both.
        "h-[100dvh] min-w-0 flex-col overflow-hidden border-r border-border pt-[var(--safe-top,0px)] pb-[var(--safe-bottom,0px)] pl-[var(--safe-left,0px)]",
        // The translucent fill only works in the desktop grid, where it sits on
        // the page background. The drawer floats over the content, so it needs
        // to be opaque or you read the dashboard straight through the menu.
        mobile ? "flex w-64 bg-card" : "hidden bg-card/40 md:flex"
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center px-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Image src="/logo.png" alt="Aina CRM" width={72} height={30} priority unoptimized className="h-7 w-auto shrink-0" />
        )}
        <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
          >
            <IconChevronLeft className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")} />
          </button>
        </Tooltip>
      </div>

      <div className={cn("flex shrink-0 items-center gap-1.5 px-3 pb-2", collapsed && "justify-center")}>
        {(() => {
          // One persistent element across both states — never swapped for a
          // separate fixed-size button — so its box keeps recalculating in
          // step with the sidebar's own animating grid column (same reason
          // the "smooth expand" case already worked), instead of popping to
          // its collapsed size the instant `collapsed` flips, ahead of the
          // sidebar actually finishing its shrink.
          const capsule = (
            <div
              role={collapsed ? "button" : undefined}
              tabIndex={collapsed ? 0 : undefined}
              onClick={collapsed ? onToggle : undefined}
              onKeyDown={
                collapsed
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggle();
                      }
                    }
                  : undefined
              }
              aria-label={collapsed ? "Expand to search modules" : undefined}
              className={cn(
                // An explicit width (100% ↔ 36px) rather than flex-1: flex-grow
                // kept claiming a few extra pixels of leftover row space beyond
                // what the collapsed circle needed, landing on a ~40×36 oval
                // instead of a true circle. Transitioning `width` directly
                // settles on an exact 36×36 every time, and still animates
                // smoothly since it's a real CSS transition, not a discrete swap.
                "box-border flex h-9 w-full min-w-0 items-center rounded-full border border-border bg-background px-3 text-sm text-muted-foreground transition-[width,padding,color,background-color,border-color] duration-300 ease-in-out focus-within:border-ring/50",
                collapsed
                  ? "w-9 cursor-pointer justify-center gap-0 px-0 hover:border-ring/50 hover:text-foreground"
                  : "gap-2"
              )}
            >
              <IconSearch className="h-4 w-4 shrink-0" />
              <input
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder="Search sidebar..."
                aria-label="Search sidebar modules"
                tabIndex={collapsed ? -1 : undefined}
                className={cn(
                  "h-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground transition-opacity duration-200",
                  // flex-1 (not just w-0) has to be dropped too — flex-basis
                  // overrides width, so a flex-1 input kept claiming the
                  // circle's remaining space even at w-0, pushing the icon
                  // off-center instead of actually collapsing to nothing.
                  collapsed ? "w-0 flex-none opacity-0" : "min-w-0 flex-1 opacity-100"
                )}
              />
              {!collapsed && navSearch && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNavSearch("");
                  }}
                  aria-label="Clear sidebar search"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
          return collapsed ? (
            <Tooltip label="Expand to search modules" side="right">
              {capsule}
            </Tooltip>
          ) : (
            capsule
          );
        })()}
        {navReady && !navSearchQuery && !collapsed && (
          <Tooltip label={rearranging ? "Done rearranging" : "Rearrange modules"} side="bottom">
            <button
              type="button"
              onClick={() => setRearranging((r) => !r)}
              aria-label={rearranging ? "Done rearranging" : "Rearrange modules"}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground",
                rearranging && "border-ring/50 bg-accent text-foreground"
              )}
            >
              {rearranging ? <IconCheck className="h-4 w-4" /> : <IconSliders className="h-4 w-4" />}
            </button>
          </Tooltip>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
        {!navReady ? (
          // Placeholder rows while we learn which modules this user may see.
          Array.from({ length: mainNav.length }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
              <Skeleton className="h-4 w-4 shrink-0" />
              {!collapsed && <Skeleton className="h-3.5 flex-1" />}
            </div>
          ))
        ) : navSearchQuery ? (
          // While searching, the list is just a filtered, non-draggable rundown —
          // reordering a partial view would scramble the saved order underneath it.
          <>
            {searchedMainNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <NavLinkItem
                  key={item.href}
                  item={item}
                  active={active}
                  badgeCount={item.href === "/messages" ? unreadMessages : 0}
                  tone={item.href === "/messages" ? "count" : "attention"}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  onNavigate={onNavigate}
                />
              );
            })}
            {searchedAdminNav.length > 0 && (
              <>
                <div
                  className={cn(
                    "mt-4 mb-1 h-4 px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70",
                    labelClass
                  )}
                >
                  Admin
                </div>
                {searchedAdminNav.map((item) => (
                  <NavLinkItem
                    key={item.href}
                    item={item}
                    active={pathname.startsWith(item.href)}
                    badgeCount={item.href === "/admin/attendance" ? pendingCount : item.href === "/admin/leave" ? pendingLeave : item.href === "/admin/expenses" ? pendingExpenses : 0}
                    collapsed={collapsed}
                    labelClass={labelClass}
                    onNavigate={onNavigate}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          // Main nav and Admin nav drag within their own SortableContext (so a
          // drag never jumps an item across the permission boundary between
          // them), but share one DndContext — every module in the sidebar,
          // Admin section included, is reorderable the same way.
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleNavDragEnd}>
            <SortableContext items={visibleMainNav.map((i) => i.href)} strategy={verticalListSortingStrategy}>
              {visibleMainNav.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <SortableNavItem
                    key={item.href}
                    item={item}
                    rearranging={rearranging && !collapsed}
                    active={active}
                    badgeCount={item.href === "/messages" ? unreadMessages : 0}
                    tone={item.href === "/messages" ? "count" : "attention"}
                    collapsed={collapsed}
                    labelClass={labelClass}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </SortableContext>

            {(isAdmin || grantedAdminNav.length > 0) && (
              <>
                <div
                  className={cn(
                    "mt-4 mb-1 h-4 px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70",
                    labelClass
                  )}
                >
                  Admin
                </div>
                <SortableContext items={grantedAdminNav.map((i) => i.href)} strategy={verticalListSortingStrategy}>
                  {grantedAdminNav.map((item) => (
                    <SortableNavItem
                      key={item.href}
                      item={item}
                      rearranging={rearranging && !collapsed}
                      active={pathname.startsWith(item.href)}
                      badgeCount={item.href === "/admin/attendance" ? pendingCount : item.href === "/admin/leave" ? pendingLeave : item.href === "/admin/expenses" ? pendingExpenses : 0}
                      collapsed={collapsed}
                      labelClass={labelClass}
                      onNavigate={onNavigate}
                    />
                  ))}
                </SortableContext>
              </>
            )}
          </DndContext>
        )}

        {navReady && navSearchQuery && !navSearchHasResults && !collapsed && (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">No modules match &ldquo;{navSearch.trim()}&rdquo;.</p>
        )}
      </nav>
    </aside>
  );
}
