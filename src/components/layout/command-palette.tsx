"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  IconSearch,
  IconLeads,
  IconTasks,
  IconProjects,
  IconQuotations,
  IconInvoices,
  IconClock,
  IconCalendar,
  IconUsers,
  IconX,
  IconBuilding,
  IconBuildingCog,
  IconMegaphone,
  IconFileSpreadsheet,
  IconPhone,
  IconKey,
  IconFile,
  IconDashboard,
  IconMessage,
  IconCake,
  IconHistory,
  IconWallet,
  IconLayoutGrid,
} from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ManagedModule } from "@/lib/module-permissions";

interface SearchResult {
  type:
    | "lead"
    | "task"
    | "project"
    | "quotation"
    | "invoice"
    | "meeting"
    | "user"
    | "client"
    | "content"
    | "ad"
    | "report"
    | "call"
    | "password"
    | "document"
    | "attendance"
    | "department";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const TYPE_ICON = {
  lead: IconLeads,
  task: IconTasks,
  project: IconProjects,
  quotation: IconQuotations,
  invoice: IconInvoices,
  meeting: IconCalendar,
  user: IconUsers,
  client: IconBuilding,
  content: IconFile,
  ad: IconMegaphone,
  report: IconFileSpreadsheet,
  call: IconPhone,
  password: IconKey,
  document: IconFile,
  attendance: IconClock,
  department: IconBuildingCog,
} as const;

/** Wrap every occurrence of the query substring in the text so matches stand out. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let from = 0;
  let idx = lower.indexOf(needle, from);
  let k = 0;
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark key={k++} className="rounded-[2px] bg-primary/25 text-foreground">
        {text.slice(idx, idx + needle.length)}
      </mark>
    );
    from = idx + needle.length;
    idx = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

const RECENT_SEARCHES_KEY = "aina-recent-searches";
const RECENT_PAGES_KEY = "aina-recent-pages";
const RECENT_MODULES_KEY = "aina-recent-modules";

function loadList<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

interface ModuleDef {
  href: string;
  label: string;
  icon: typeof IconSearch;
}

/**
 * The top-level modules worth remembering as "recently visited" — a fixed
 * list rather than importing the sidebar's own nav arrays, which aren't
 * exported and are entangled with permission-filtering logic this doesn't
 * need. Unrecognized routes (a specific record's own page, an admin
 * sub-page not listed here) are simply never tracked.
 */
const RECENT_MODULES: ModuleDef[] = [
  { href: "/", label: "Dashboard", icon: IconDashboard },
  { href: "/leads", label: "Leads", icon: IconLeads },
  { href: "/tasks", label: "Tasks", icon: IconTasks },
  { href: "/projects", label: "Projects", icon: IconProjects },
  { href: "/meetings", label: "Meetings", icon: IconCalendar },
  { href: "/messages", label: "Messages", icon: IconMessage },
  { href: "/quotations", label: "Quotations", icon: IconQuotations },
  { href: "/invoices", label: "Invoices", icon: IconInvoices },
  { href: "/passwords", label: "Password Manager", icon: IconKey },
  { href: "/birthdays", label: "Birthdays", icon: IconCake },
  { href: "/attendance", label: "My Attendance", icon: IconClock },
  { href: "/leave", label: "My Leave", icon: IconCalendar },
  { href: "/expenses", label: "My Expenses", icon: IconWallet },
  { href: "/activity", label: "My Activity", icon: IconHistory },
  { href: "/clients", label: "Clients", icon: IconBuilding },
  { href: "/calls", label: "Calls", icon: IconPhone },
  { href: "/forms", label: "Forms", icon: IconLayoutGrid },
  { href: "/teams", label: "Teams", icon: IconUsers },
  { href: "/admin/users", label: "Users & Invites", icon: IconUsers },
  { href: "/admin/departments", label: "Departments", icon: IconBuildingCog },
];
// Longest href first, so "/admin/users" matches before a hypothetical
// shorter prefix would — not load-bearing today (no two entries share a
// prefix) but keeps this correct if the list grows.
const RECENT_MODULES_BY_LENGTH = [...RECENT_MODULES].sort((a, b) => b.href.length - a.href.length);

/**
 * The subset of RECENT_MODULES a Permission Manager "block" can hide —
 * mirrors sidebar.tsx's BLOCKABLE_HREF_MODULE for just these hrefs. A
 * previously-visited module that's since been blocked would otherwise stay
 * in "Recently Visited" and send the person to a page that just redirects
 * them away, with no explanation.
 */
const RECENT_MODULE_BLOCK_KEY: Partial<Record<string, ManagedModule>> = {
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

/** Which registered module (if any) a pathname belongs to — exact match, or a sub-route of it (e.g. "/projects/abc123" still counts as "Projects"). */
function moduleForPathname(pathname: string): ModuleDef | null {
  return RECENT_MODULES_BY_LENGTH.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`)) ?? null;
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentPages, setRecentPages] = useState<SearchResult[]>([]);
  const [recentModulesRaw, setRecentModulesRaw] = useState<ModuleDef[]>([]);
  const [blockedModules, setBlockedModules] = useState<string[]>([]);
  // Filtered at render time, not baked into state when loaded — so a blocked-modules
  // fetch that resolves after the palette is already open still takes effect, without
  // re-running (and resetting) the open-triggered load effect below.
  const recentModules = useMemo(
    () =>
      recentModulesRaw.filter((m) => {
        const blockKey = RECENT_MODULE_BLOCK_KEY[m.href];
        return !blockKey || !blockedModules.includes(blockKey);
      }),
    [recentModulesRaw, blockedModules]
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // A blocked module (Permission Manager) shouldn't surface here even if the
  // person visited it before being blocked — admins are never blocked, so
  // this is skipped for them (mirrors sidebar.tsx's own isAdmin bypass).
  useEffect(() => {
    fetch("/api/module-visibility")
      .then((r) => r.json())
      .then((d) => setBlockedModules(d.isAdmin ? [] : Array.isArray(d.blockedModules) ? d.blockedModules : []))
      .catch(() => {});
  }, []);

  // Records every top-level module actually visited (page loads, not just
  // results picked from this palette) — a reload, a sidebar click, a link
  // from somewhere else all count, so "recently visited" reflects real
  // usage rather than only navigation that happened to go through search.
  useEffect(() => {
    const mod = moduleForPathname(pathname);
    if (!mod) return;
    const existing = loadList<ModuleDef>(RECENT_MODULES_KEY);
    if (existing[0]?.href === mod.href) return; // already the most recent — nothing to move
    const next = [mod, ...existing.filter((m) => m.href !== mod.href)].slice(0, 6);
    localStorage.setItem(RECENT_MODULES_KEY, JSON.stringify(next.map(({ href, label }) => ({ href, label }))));
  }, [pathname]);

  // Global ⌘K / Ctrl+K to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setRecentSearches(loadList<string>(RECENT_SEARCHES_KEY));
      setRecentPages(loadList<SearchResult>(RECENT_PAGES_KEY));
      // Stored as {href, label} only (a component reference can't survive
      // JSON) — resolved back against the canonical list for its icon. An
      // href no longer in that list (a module removed in a later update)
      // just silently drops out instead of rendering with a missing icon.
      const storedModules = loadList<{ href: string; label: string }>(RECENT_MODULES_KEY);
      setRecentModulesRaw(
        storedModules
          .map((s) => RECENT_MODULES.find((m) => m.href === s.href))
          .filter((m): m is ModuleDef => !!m)
      );
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search. Fewer than 2 characters is skipped entirely — matches
  // the API's own floor (too broad to be useful, and a single keystroke
  // would otherwise fan out into 16 parallel queries for nothing).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({ results: [] }));
        setResults(data.results ?? []);
      } catch (err) {
        // Aborted because a newer keystroke superseded this request — not a
        // real failure, so it shouldn't flash "no results" for a stale query.
        if ((err as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  const rememberSearch = useCallback((q: string) => {
    const next = [q, ...loadList<string>(RECENT_SEARCHES_KEY).filter((s) => s !== q)].slice(0, 6);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    setRecentSearches(next);
  }, []);

  function clearRecentSearches() {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  }

  function clearRecentPages() {
    localStorage.removeItem(RECENT_PAGES_KEY);
    setRecentPages([]);
  }

  function clearRecentModules() {
    localStorage.removeItem(RECENT_MODULES_KEY);
    setRecentModulesRaw([]);
  }

  function goToModule(mod: ModuleDef) {
    setOpen(false);
    router.push(mod.href);
  }

  // Pressing Enter records the term as a recent search.
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      rememberSearch(query.trim());
    }
  }

  const select = useCallback(
    (item: SearchResult) => {
      const pages = [item, ...loadList<SearchResult>(RECENT_PAGES_KEY).filter((p) => !(p.type === item.type && p.id === item.id))].slice(0, 6);
      localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(pages));
      if (query.trim()) rememberSearch(query.trim());
      setOpen(false);
      router.push(item.href);
    },
    [query, rememberSearch, router]
  );

  const showRecents = !query.trim();

  return (
    <>
      <Tooltip label="Search (Ctrl / ⌘ K)" side="bottom">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
        >
          <IconSearch className="h-5 w-5" />
        </button>
      </Tooltip>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[600px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
          >
            <Dialog.Title className="sr-only">Search</Dialog.Title>
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <IconSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search Anything..."
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {showRecents ? (
                <>
                  {recentSearches.length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                          Recent Searches
                        </p>
                        <button
                          type="button"
                          aria-label="Clear recent searches"
                          onClick={clearRecentSearches}
                          className="flex h-5 items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <IconX className="h-3 w-3" />
                          Clear
                        </button>
                      </div>
                      {recentSearches.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setQuery(s)}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-primary/5"
                        >
                          <IconClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{s}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {recentPages.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                          Recent Pages
                        </p>
                        <button
                          type="button"
                          aria-label="Clear recent pages"
                          onClick={clearRecentPages}
                          className="flex h-5 items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <IconX className="h-3 w-3" />
                          Clear
                        </button>
                      </div>
                      {recentPages.map((r) => (
                        <ResultRow key={`${r.type}-${r.id}`} result={r} onSelect={select} />
                      ))}
                    </div>
                  )}
                  {recentModules.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                          Recently Visited
                        </p>
                        <button
                          type="button"
                          aria-label="Clear recently visited"
                          onClick={clearRecentModules}
                          className="flex h-5 items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <IconX className="h-3 w-3" />
                          Clear
                        </button>
                      </div>
                      {recentModules.map((mod) => (
                        <button
                          key={mod.href}
                          type="button"
                          onClick={() => goToModule(mod)}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-primary/5"
                        >
                          <mod.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">{mod.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {recentSearches.length === 0 && recentPages.length === 0 && recentModules.length === 0 && (
                    <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                      Search across leads, tasks, projects, meetings, quotations, invoices and more
                    </p>
                  )}
                </>
              ) : query.trim().length < 2 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">Keep typing to search…</p>
              ) : loading ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">No results for “{query}”</p>
              ) : (
                results.map((r) => <ResultRow key={`${r.type}-${r.id}`} result={r} onSelect={select} query={query} />)
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function ResultRow({ result, onSelect, query = "" }: { result: SearchResult; onSelect: (r: SearchResult) => void; query?: string }) {
  const Icon = TYPE_ICON[result.type];
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-primary/5"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">
          <Highlight text={result.title} query={query} />
        </span>
        {result.subtitle && (
          <span className="text-muted-foreground">
            {" — "}
            <Highlight text={result.subtitle} query={query} />
          </span>
        )}
      </span>
      <span className={cn("shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60")}>
        {result.type}
      </span>
    </button>
  );
}
