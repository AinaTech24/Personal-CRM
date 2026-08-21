"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
} from "@/components/icons";
import { LottieIcon } from "@/components/icons/lottie-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

function loadList<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentPages, setRecentPages] = useState<SearchResult[]>([]);
  const [hovering, setHovering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({ results: [] }));
      setResults(data.results ?? []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(id);
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
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
        >
          <LottieIcon src="/icons/Search.json" size={20} playing={hovering} highlighted={hovering} />
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
                  {recentSearches.length === 0 && recentPages.length === 0 && (
                    <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                      Search across leads, tasks, projects, meetings, quotations, invoices and more
                    </p>
                  )}
                </>
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
