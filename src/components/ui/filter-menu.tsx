"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconChevronDown, IconFilter } from "@/components/icons";
import { cn } from "@/lib/utils";

/** One shared easing so the popover and its sub-dropdowns feel like one motion. */
const EASE = [0.16, 1, 0.3, 1] as const;

export interface FilterOption {
  value: string;
  label: string;
  /** Base64 data URL for user options. */
  avatarDataUrl?: string | null;
  /** Render an avatar bubble even without a photo (falls back to an initial). */
  showAvatar?: boolean;
}

export interface FilterFacet {
  key: string;
  label: string;
  /** The current selection, or null for "all" (no filter on this facet). */
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
  /** Wording for the reset row — "All", "Anyone", etc. Defaults to "All". */
  allLabel?: string;
}

function Avatar({ option }: { option: FilterOption }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
      {option.avatarDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.avatarDataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        (option.label.trim()[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}

/**
 * A single filter control for a list toolbar: one icon button that opens a
 * popover of facets, each an expandable sub-dropdown.
 *
 * Facets expand inline (accordion) rather than opening nested popovers — a
 * submenu flipping across the viewport edge is fiddly to place and worse on a
 * phone, and everything here fits in one panel. Only one facet is open at a
 * time so the panel never grows past the screen.
 *
 * A dot on the icon and a count in the header make active filters visible
 * without opening it, because a filter you've forgotten is on is a filter that
 * makes the list look empty for no reason.
 */
export function FilterMenu({ facets, className }: { facets: FilterFacet[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const activeCount = facets.filter((f) => f.value !== null).length;

  function clearAll() {
    for (const f of facets) if (f.value !== null) f.onChange(null);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setExpanded(null);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={activeCount ? `Filters (${activeCount} active)` : "Filters"}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-md border border-input transition-colors hover:bg-primary/5",
            activeCount > 0 && "border-primary text-primary",
            className
          )}
        >
          <IconFilter className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
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
                transition={{ duration: 0.16, ease: EASE }}
                className="z-50 w-64 origin-top-right overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
              >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {facets.map((facet) => {
              const isOpen = expanded === facet.key;
              const selected = facet.value !== null ? facet.options.find((o) => o.value === facet.value) : null;
              return (
                <div key={facet.key} className="border-t border-border/60 first:border-t-0">
                  <button
                    type="button"
                    onClick={() => setExpanded((k) => (k === facet.key ? null : facet.key))}
                    className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-primary/5"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-muted-foreground">{facet.label}</span>
                      <span className={cn("flex items-center gap-1.5 truncate", !selected && "text-muted-foreground")}>
                        {selected && (selected.showAvatar || selected.avatarDataUrl) && <Avatar option={selected} />}
                        {selected ? selected.label : (facet.allLabel ?? "All")}
                      </span>
                    </span>
                    <IconChevronDown
                      className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                    />
                  </button>

                  {/* Height-auto expand/collapse so a facet's options slide open
                      rather than snapping the panel taller. overflow-hidden on
                      the animating element clips the options mid-slide. */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="options"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="pb-1">
                          <button
                            type="button"
                            onClick={() => {
                              facet.onChange(null);
                              setExpanded(null);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-primary/5",
                              facet.value === null && "bg-accent/60"
                            )}
                          >
                            <span className="text-muted-foreground">{facet.allLabel ?? "All"}</span>
                            {facet.value === null && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          </button>
                          {facet.options.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                facet.onChange(opt.value);
                                setExpanded(null);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-primary/5",
                                opt.value === facet.value && "bg-accent/60"
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                {(opt.showAvatar || opt.avatarDataUrl) && <Avatar option={opt} />}
                                <span className="truncate">{opt.label}</span>
                              </span>
                              {opt.value === facet.value && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
