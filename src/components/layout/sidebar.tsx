"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  IconLeads,
  IconQuotations,
  IconInvoices,
  IconBuilding,
  IconMail,
  IconSettings,
  IconClock,
  IconChevronLeft,
  IconGrid,
  IconHistory,
  IconUsers,
  IconPhone,
  IconKey,
} from "@/components/icons";
import { LottieIcon } from "@/components/icons/lottie-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocket } from "@/components/providers/socket-provider";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  // `hovering`/`highlighted` are only ever set (and only ever read) by a
  // Lottie-backed icon — a static Icon* simply ignores props it doesn't
  // declare; it gets both effects for free via `stroke="currentColor"`.
  icon: React.ComponentType<{ className?: string; hovering?: boolean; highlighted?: boolean }>;
}

/**
 * Wraps a Lottie animation (see lottie-icon.tsx) so it can slot into
 * NavItem.icon exactly like a static SVG component — static at rest, plays
 * for as long as the row it's part of is hovered, and recolors to match
 * whatever shade the row's own label text is currently in (muted at rest,
 * full foreground once hovered or on the active route) so it "highlights"
 * the same way a static icon's `currentColor` stroke already does. Both are
 * threaded in from the row itself (NavLinkItem below), not tracked here, so
 * hovering anywhere on the row — not just the icon glyph — triggers it.
 * Only the icons an animated replacement has actually been provided for use
 * this; everything else still uses its static Icon*.
 */
function lottieNavIcon(src: string) {
  return function NavIcon({
    className,
    hovering,
    highlighted,
  }: {
    className?: string;
    hovering?: boolean;
    highlighted?: boolean;
  }) {
    // Matches the h-5 w-5 (20px) every static Icon* renders at here — Lottie
    // needs an explicit pixel size rather than relying on the className alone.
    return <LottieIcon src={src} size={20} className={className} playing={hovering} highlighted={highlighted} />;
  };
}

/**
 * Every static Icon* spreads its full props object onto the underlying
 * `<svg>` (see icons/index.tsx's `base()`) so its caller can pass through
 * arbitrary SVG attributes — which means an unwrapped static icon would leak
 * `hovering`/`highlighted` straight onto the DOM as invalid boolean
 * attributes. This strips them before the icon ever sees them, so every
 * NavItem.icon can be called identically regardless of which kind it is.
 */
function staticNavIcon(Icon: React.ComponentType<{ className?: string }>) {
  return function NavIcon({ className }: { className?: string; hovering?: boolean; highlighted?: boolean }) {
    return <Icon className={className} />;
  };
}

const LottieDashboard = lottieNavIcon("/icons/Dashboard.json");
const LottieTasks = lottieNavIcon("/icons/Tasks.json");
const LottieProjects = lottieNavIcon("/icons/Projects.json");
const LottieMeetings = lottieNavIcon("/icons/Meetings.json");
const LottieMessages = lottieNavIcon("/icons/Messages.json");
const LottieClients = lottieNavIcon("/icons/Clients.json");
const LottieUsersInvites = lottieNavIcon("/icons/users and invites.json");

const mainNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LottieDashboard },
  { href: "/leads", label: "Leads", icon: staticNavIcon(IconLeads) },
  { href: "/tasks", label: "Tasks", icon: LottieTasks },
  { href: "/projects", label: "Projects", icon: LottieProjects },
  { href: "/meetings", label: "Meetings", icon: LottieMeetings },
  { href: "/messages", label: "Messages", icon: LottieMessages },
  { href: "/quotations", label: "Quotations", icon: staticNavIcon(IconQuotations) },
  { href: "/invoices", label: "Invoices", icon: staticNavIcon(IconInvoices) },
  { href: "/passwords", label: "Password Manager", icon: staticNavIcon(IconKey) },
  { href: "/attendance", label: "My Attendance", icon: staticNavIcon(IconClock) },
  { href: "/activity", label: "My Activity", icon: staticNavIcon(IconHistory) },
];

const adminNav: NavItem[] = [
  { href: "/admin/modules", label: "Modules", icon: staticNavIcon(IconGrid) },
  { href: "/admin/logs", label: "View logs", icon: staticNavIcon(IconHistory) },
  { href: "/admin/departments", label: "Departments", icon: staticNavIcon(IconBuilding) },
  { href: "/admin/users", label: "Users & Invites", icon: LottieUsersInvites },
  { href: "/social-media/team", label: "Social Media Team", icon: staticNavIcon(IconUsers) },
  { href: "/crm/team", label: "CRM Team", icon: staticNavIcon(IconUsers) },
  { href: "/admin/attendance", label: "Attendance", icon: staticNavIcon(IconClock) },
  { href: "/admin/email", label: "Email (SMTP)", icon: staticNavIcon(IconMail) },
  { href: "/admin/settings", label: "Application", icon: staticNavIcon(IconSettings) },
];

/**
 * A team member (regular or lead, not a company admin) still needs some way
 * to reach their own client list day to day even without the admin nav's
 * "Social Media Team" link above, so this one link survives for them
 * specifically.
 */
const clientsNavItem: NavItem = { href: "/clients", label: "Clients", icon: LottieClients };

/**
 * A non-admin lead's own way into the same Team console an Admin/Super Admin
 * reaches via adminNav's "Social Media Team" entry above — a regular
 * (non-lead) team member doesn't manage the team, so they don't get this.
 */
const teamNavItem: NavItem = { href: "/social-media/team", label: "Social Media Team", icon: staticNavIcon(IconUsers) };

/** Modules a Social Media team member (regular or lead) never sees, even if an admin hasn't globally hidden them. */
const SOCIAL_MEDIA_EXCLUDED_HREFS = ["/quotations"];

/**
 * A CRM team member's way into the call log — unlike Social Media, CRM isn't
 * a separate curated line of business (they still need Quotations, Invoices,
 * etc.), so this is purely additive rather than replacing anything.
 */
const callsNavItem: NavItem = { href: "/calls", label: "Calls", icon: staticNavIcon(IconPhone) };

/** A non-admin CRM lead's own way into the CRM Team console — mirrors teamNavItem above. */
const crmTeamNavItem: NavItem = { href: "/crm/team", label: "CRM Team", icon: staticNavIcon(IconUsers) };

/**
 * One sidebar row. Defined at module scope (not inside Sidebar) so its
 * identity is stable across renders — a component recreated every render
 * would remount here, losing the very hover state this exists to hold.
 * Hover is tracked on the whole row and forwarded to item.icon as
 * `hovering`, so a Lottie-backed icon animates the moment the pointer
 * enters anywhere on the link, not just its own glyph. `highlighted`
 * (hovering or the active route) is forwarded alongside it, matching
 * exactly when the row's own label text switches from muted to foreground,
 * so the icon "lights up" the same way the text does.
 */
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
  const [hovering, setHovering] = useState(false);
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
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground",
          active && "bg-accent text-foreground"
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="h-5 w-5" hovering={hovering} highlighted={hovering || active} />
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

/**
 * Presentational sidebar rail. Its width is driven by the parent grid column
 * (animated via grid-template-columns), so this only fills and clips its column.
 */
export function Sidebar({
  isAdmin,
  restrictToSocialMedia,
  isSocialMediaLead,
  hasCrmAccess,
  isCrmLead,
  collapsed,
  onToggle,
  /** Rendered inside the mobile drawer: always visible, always expanded. */
  mobile = false,
  onNavigate,
}: {
  isAdmin: boolean;
  restrictToSocialMedia: boolean;
  isSocialMediaLead: boolean;
  hasCrmAccess: boolean;
  isCrmLead: boolean;
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  // Admins see every module, so their nav is correct on first paint. Everyone
  // else has to wait for the visibility list — without this the full nav
  // renders and then items vanish as the answer arrives.
  const [navReady, setNavReady] = useState(isAdmin);
  const { socket } = useSocket();

  // Which modules an admin has hidden from regular users. Admins see everything.
  useEffect(() => {
    if (isAdmin) return;
    let active = true;
    fetch("/api/module-visibility")
      .then((r) => r.json())
      .then((d) => {
        if (active) setHiddenModules(Array.isArray(d.hiddenModules) ? d.hiddenModules : []);
      })
      .catch(() => {})
      .finally(() => {
        // Ready either way: a failed fetch shows the full nav rather than none.
        if (active) setNavReady(true);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  let visibleMainNav = isAdmin
    ? [...mainNav]
    : mainNav.filter(
        // "My Activity" is a personal record of one's own actions, not a
        // toggleable module — an admin hiding it would just be hiding the
        // one place a regular user can see their own history.
        (item) => item.href === "/" || item.href === "/activity" || !hiddenModules.includes(item.href.replace(/^\//, ""))
      );

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
  // Social Media is — and just gain "Calls" right after Leads. A lead
  // additionally gets the Team console link itself, right after Calls.
  if (hasCrmAccess && !isAdmin) {
    const leadsIndex = visibleMainNav.findIndex((item) => item.href === "/leads");
    const insertAt = leadsIndex === -1 ? visibleMainNav.length : leadsIndex + 1;
    visibleMainNav.splice(insertAt, 0, ...(isCrmLead ? [callsNavItem, crmTeamNavItem] : [callsNavItem]));
  }

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

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
        {!navReady
          ? // Placeholder rows while we learn which modules this user may see.
            Array.from({ length: mainNav.length }, (_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
                <Skeleton className="h-4 w-4 shrink-0" />
                {!collapsed && <Skeleton className="h-3.5 flex-1" />}
              </div>
            ))
          : visibleMainNav.map((item) => {
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
            {adminNav.map((item) => (
              <NavLinkItem
                key={item.href}
                item={item}
                active={pathname.startsWith(item.href)}
                badgeCount={item.href === "/admin/attendance" ? pendingCount : 0}
                collapsed={collapsed}
                labelClass={labelClass}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
