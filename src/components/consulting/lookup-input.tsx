"use client";

import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { IconChevronDown, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  label: string;
  status?: string | null;
}

/**
 * Searchable reference picker for a Command Centre record. `url` returns
 * {items: [{id, label}]}; `filters` narrow the search (e.g. to one MFD, so a
 * record can only point at its own organization's records — GV-04).
 */
export function LookupInput({
  url,
  value,
  label,
  onChange,
  filters,
  disabled,
  placeholder = "Search…",
  id,
}: {
  url: string;
  value: string | null;
  label?: string | null;
  onChange: (id: string | null, label: string | null) => void;
  filters?: Record<string, string | null | undefined>;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters ?? {});
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const u = new URL(url, window.location.origin);
        if (q.trim()) u.searchParams.set("q", q.trim());
        for (const [k, v] of Object.entries(JSON.parse(filterKey) as Record<string, string | null>)) if (v) u.searchParams.set(k, v);
        const res = await fetch(u.toString(), { cache: "no-store" });
        const data = await res.json();
        if (n !== seq.current) return;
        if (!res.ok) setError(data.error ?? "Couldn't load options");
        else setItems(data.items ?? []);
      } catch {
        if (n === seq.current) setError("Couldn't load options");
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [open, q, url, filterKey]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? (label ?? "Selected") : placeholder}</span>
            <IconChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </Popover.Trigger>
        {value && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange(null, null)}
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[200] w-[var(--radix-popover-trigger-width)] min-w-64 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type to search…"
            className="mb-1 h-8 w-full rounded border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="max-h-64 overflow-y-auto">
            {loading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</p>}
            {error && <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>}
            {!loading && !error && items.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches</p>}
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onChange(it.id, it.label);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-primary/10",
                  it.id === value && "bg-primary/10"
                )}
              >
                <span className="truncate">{it.label}</span>
                {it.status && <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{it.status.replace(/_/g, " ")}</span>}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
