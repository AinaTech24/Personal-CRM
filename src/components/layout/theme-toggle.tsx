"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconSun, IconMoon, IconMonitor, IconCheck } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconMonitor },
] as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  // The trigger icon reflects what's actually on screen (resolvedTheme) —
  // when theme is "system" that's the OS preference, not the literal string.
  const TriggerIcon = resolvedTheme === "light" ? IconSun : IconMoon;

  return (
    <DropdownMenu.Root>
      <Tooltip label="Theme" side="bottom">
        <DropdownMenu.Trigger asChild>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
            aria-label="Change theme"
          >
            <TriggerIcon className="h-5 w-5" />
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {OPTIONS.map((opt) => (
            <DropdownMenu.Item
              key={opt.value}
              onSelect={() => setTheme(opt.value)}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none hover:bg-primary/5"
            >
              <opt.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">{opt.label}</span>
              {theme === opt.value && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Reusable in Settings (which wants the same three-way choice inline, not behind a trigger). */
export function ThemeOptionRow() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-1.5 rounded-md border border-border p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
            theme === opt.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <opt.icon className="h-3.5 w-3.5" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
