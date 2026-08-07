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
  /**
   * The current selection. null (or an empty array) means "all" — no filter
   * on this facet. A plain string outside `multiple` mode; an array of
   * selected values when `multiple` is true.
   */
  value: string | string[] | null;
  options: FilterOption[];
  onChange: (value: string | string[] | null) => void;
  /** Wording for the reset row — "All", "Anyone", etc. Defaults to "All". */
  allLabel?: string;
  /**
   * Lets more than one option be checked at once within this facet —
   * clicking an option toggles it rather than replacing the selection and
   * closing the facet. Defaults to false (the original single-select
   * behavior every existing call site still gets).
   */
  multiple?: boolean;
}

function facetSelectedValues(facet: FilterFacet): string[] {
  return Array.isArray(facet.value) ? facet.value : facet.value !== null ? [facet.value] : [];
}

function facetIsActive(facet: FilterFacet): boolean {
  return facetSelectedValues(facet).length > 0;
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

  const activeCount = facets.filter(facetIsActive).length;

  function clearAll() {
    for (const f of facets) if (facetIsActive(f)) f.onChange(f.multiple ? [] : null);
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
              const selectedValues = facetSelectedValues(facet);
              const selectedOptions = facet.options.filter((o) => selectedValues.includes(o.value));
              const noneSelected = selectedOptions.length === 0;
              const summary =
                selectedOptions.length === 0
                  ? (facet.allLabel ?? "All")
                  : selectedOptions.length === 1
                    ? selectedOptions[0].label
                    : `${selectedOptions.length} selected`;
              return (
                <div key={facet.key} className="border-t border-border/60 first:border-t-0">
                  <button
                    type="button"
                    onClick={() => setExpanded((k) => (k === facet.key ? null : facet.key))}
                    className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-primary/5"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-muted-foreground">{facet.label}</span>
                      <span className={cn("flex items-center gap-1.5 truncate", noneSelected && "text-muted-foreground")}>
                        {selectedOptions.length === 1 && (selectedOptions[0].showAvatar || selectedOptions[0].avatarDataUrl) && (
                          <Avatar option={selectedOptions[0]} />
                        )}
                        {summary}
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
                              facet.onChange(facet.multiple ? [] : null);
                              if (!facet.multiple) setExpanded(null);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-primary/5",
                              noneSelected && "bg-accent/60"
                            )}
                          >
                            <span className="text-muted-foreground">{facet.allLabel ?? "All"}</span>
                            {noneSelected && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          </button>
                          {facet.options.map((opt) => {
                            const isChecked = selectedValues.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  if (facet.multiple) {
                                    facet.onChange(
                                      isChecked ? selectedValues.filter((v) => v !== opt.value) : [...selectedValues, opt.value]
                                    );
                                    // Stays open — picking a second or third value
                                    // shouldn't require reopening the facet each time.
                                  } else {
                                    facet.onChange(opt.value);
                                    setExpanded(null);
                                  }
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-primary/5",
                                  isChecked && "bg-accent/60"
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  {(opt.showAvatar || opt.avatarDataUrl) && <Avatar option={opt} />}
                                  <span className="truncate">{opt.label}</span>
                                </span>
                                {isChecked && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                              </button>
                            );
                          })}
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
