"use client";

import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconDots } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface RowAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Styles the item as destructive (red). */
  destructive?: boolean;
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
          {actions.map((a) => (
            <DropdownMenu.Item
              key={a.key}
              onSelect={a.onSelect}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5",
                a.destructive && "text-destructive"
              )}
            >
              {a.icon}
              {a.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
