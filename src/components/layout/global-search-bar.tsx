"use client";

import { IconSearch, IconX } from "@/components/icons";
import { useSearch } from "@/components/providers/search-provider";

/**
 * Filters the current page's own list (Leads/Tasks/Projects/Invoices/
 * Quotations) — reads/writes the shared SearchContext those boards already
 * read `query` from. SearchProvider resets it on every route change, so
 * typing here never bleeds into the next page you navigate to.
 */
export function GlobalSearchBar({ placeholder = "Search this list…" }: { placeholder?: string }) {
  const { query, setQuery } = useSearch();

  return (
    <div className="relative w-full shrink-0 sm:w-56">
      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
