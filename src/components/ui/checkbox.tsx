"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Custom checkbox with an animated draw-in checkmark and a spring "pop" on toggle.
 * Stops propagation so it can sit inside a clickable row/card without triggering
 * the row's own click handler.
 */
export const Checkbox = React.forwardRef<
  HTMLButtonElement,
  {
    checked: boolean;
    onChange: (checked: boolean) => void;
    className?: string;
    "aria-label"?: string;
  }
>(({ checked, onChange, className, "aria-label": ariaLabel }, ref) => {
  return (
    <motion.button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
      animate={{ scale: checked ? [1, 1.18, 1] : 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150",
        checked ? "border-primary bg-primary" : "border-input bg-background hover:border-primary/60",
        className
      )}
    >
      <AnimatePresence>
        {checked && (
          <motion.svg
            viewBox="0 0 16 16"
            className="h-3 w-3 text-primary-foreground"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.22, delay: 0.03, ease: "easeOut" }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  );
});
Checkbox.displayName = "Checkbox";

/**
 * Wraps a Checkbox so it appears only when the row/card is hovered (or it's
 * checked, in which case it stays put). Requires a `group` class on the
 * hover-triggering ancestor.
 *
 * Two reveal modes:
 * - `width` (default) slides in from zero width, reserving no space up front —
 *   right for a flex card where the title should sit flush left until hover.
 * - `fade` keeps a fixed-size box always laid out and only animates opacity —
 *   right for a table cell, where a width change would resize the column and
 *   shove every following column sideways on hover.
 */
export function HoverCheckbox({
  checked,
  onChange,
  className,
  wrapperClassName,
  reveal = "width",
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  wrapperClassName?: string;
  reveal?: "width" | "fade";
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        reveal === "fade"
          ? cn(
              "transition-opacity duration-200 ease-out",
              checked
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            )
          : cn(
              "overflow-hidden transition-[width,margin-right,opacity] duration-200 ease-out",
              checked
                ? "w-4.5 mr-2 opacity-100"
                : "w-0 mr-0 opacity-0 group-hover:w-4.5 group-hover:mr-2 group-hover:opacity-100 group-focus-within:w-4.5 group-focus-within:mr-2 group-focus-within:opacity-100"
            ),
        wrapperClassName
      )}
    >
      <Checkbox checked={checked} onChange={onChange} className={className} aria-label={ariaLabel} />
    </div>
  );
}
