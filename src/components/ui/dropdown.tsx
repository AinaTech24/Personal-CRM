"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { IconCheck, IconChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional avatar (base64 data URL). User pickers pass the person's photo. */
  avatarDataUrl?: string | null;
  /** Set to render an avatar bubble even without a photo (falls back to an initial). */
  showAvatar?: boolean;
}

/** Small round avatar used inside user dropdowns. */
function OptionAvatar({ option }: { option: DropdownOption }) {
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

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
  id?: string;
}

export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select...",
  emptyMessage = "No options",
  disabled,
  size = "default",
  className,
  id,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            size === "sm" ? "h-8 px-2 text-xs" : "h-9",
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && (selected.showAvatar || selected.avatarDataUrl) && <OptionAvatar option={selected} />}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <IconChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-64 w-[var(--radix-popover-trigger-width)] min-w-32 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.length === 0 ? (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
                  opt.value === value && "bg-accent/60"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {(opt.showAvatar || opt.avatarDataUrl) && <OptionAvatar option={opt} />}
                  <span className="truncate">{opt.label}</span>
                </span>
                {opt.value === value && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            ))
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
