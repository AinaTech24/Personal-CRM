"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { IconSun, IconMoon } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  return (
    <Tooltip label={theme === "dark" ? "Light mode" : "Dark mode"} side="bottom">
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
      </button>
    </Tooltip>
  );
}
