"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { LottieIcon } from "@/components/icons/lottie-icon";
import { Tooltip } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  return (
    <Tooltip label={theme === "dark" ? "Light mode" : "Dark mode"} side="bottom">
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? (
          <LottieIcon src="/icons/Sun.json" size={20} playing={hovering} highlighted={hovering} />
        ) : (
          <LottieIcon src="/icons/Moon.json" size={20} playing={hovering} highlighted={hovering} />
        )}
      </button>
    </Tooltip>
  );
}
