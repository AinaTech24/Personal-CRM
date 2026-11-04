"use client";

import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconDots } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface RowAction {
  key: string;
  label: string;
  icon: ReactNode;
  /** Required unless `items` is set — a submenu trigger has no action of its own. */
  onSelect?: () => void;
  /** Styles the item as destructive (red). */
  destructive?: boolean;
  /**
   * Renders this entry as a submenu trigger opening these nested actions
   * instead of a leaf item — e.g. "Move to…" with one entry per status, for
   * a touch device where dragging a board card isn't possible at all (native
   * HTML5 drag-and-drop doesn't fire from touch input). Mutually exclusive
   * with `onSelect`; nesting stops at one level.
   */
  items?: RowAction[];
}

/**
 * A 3-dot actions menu for a card or table row (Edit / Disable / Delete …).
 *
 * The caller passes only the actions the current user is allowed to take, so
 * permission lives with the data, not here. Renders nothing when the list is
 * empty — a user who can't do anything sees no menu rather than an empty one.
 *
 * Every click is stopped from bubbling so the menu works inside a row/card that
 * has its own click handler.
 */
export function RowActionsMenu({
  actions,
  label = "Actions",
  align = "end",
  triggerClassName,
}: {
  actions: RowAction[];
  label?: string;
  align?: "start" | "end";
  triggerClassName?: string;
}) {
  if (actions.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground",
            triggerClassName
          )}
        >
          <IconDots className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-40 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          {actions.map((a) =>
            a.items ? (
              <DropdownMenu.Sub key={a.key}>
                <DropdownMenu.SubTrigger
                  className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5 data-[state=open]:bg-primary/5"
                >
                  {a.icon}
                  {a.label}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent
                    sideOffset={4}
                    alignOffset={-4}
                    onClick={(e) => e.stopPropagation()}
                    className="z-50 w-44 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
                  >
                    {a.items.map((sub) => (
                      <DropdownMenu.Item
                        key={sub.key}
                        onSelect={sub.onSelect}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5",
                          sub.destructive && "text-status-destructive-text"
                        )}
                      >
                        {sub.icon}
                        {sub.label}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : (
              <DropdownMenu.Item
                key={a.key}
                onSelect={a.onSelect}
                className={cn(
                  "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5",
                  // Not text-destructive: that color is tuned for white-on-solid
                  // (the Button's destructive variant), and reads too light
                  // against the plain popover background in light mode.
                  a.destructive && "text-status-destructive-text"
                )}
              >
                {a.icon}
                {a.label}
              </DropdownMenu.Item>
            )
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
