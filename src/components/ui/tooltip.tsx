"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

interface Pos {
  top: number;
  left: number;
  transform: string;
}

/** Small directional offset the tooltip animates in from / out to, per side. */
const OFFSET: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: 4 },
  bottom: { x: 0, y: -4 },
  left: { x: 4, y: 0 },
  right: { x: -4, y: 0 },
};

/** How long the pointer must rest before the label appears. */
const OPEN_DELAY_MS = 2000;

/**
 * Is this a touch device with no real pointer?
 *
 * Tooltips are hover affordances. On a phone or an installed PWA there is no
 * hover, so a tap both fires the action and flashes a label over it — noise on
 * the smallest screen. Checked at render rather than by viewport width, since a
 * narrow desktop window still has a mouse.
 */
function usesTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

/**
 * Lightweight hover/focus tooltip. The label is rendered in a portal with fixed
 * positioning so it escapes any `overflow: hidden` / stacking context on the
 * trigger's ancestors, and fades/slides in and out via framer-motion.
 *
 * Opens only after the pointer has rested for a couple of seconds — these
 * label controls whose icons are mostly self-evident, so appearing instantly
 * made them flicker across the screen as the cursor crossed a toolbar.
 */
export function Tooltip({
  label,
  side = "top",
  children,
  className,
  wrapperClassName,
}: {
  label: React.ReactNode;
  side?: Side;
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolved after mount: the media query isn't available while rendering on
  // the server, and guessing would hydrate a mismatch.
  const [touch, setTouch] = React.useState(false);
  React.useEffect(() => setTouch(usesTouch()), []);

  // A pending open must not fire after the trigger has gone.
  React.useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
  }, []);

  const place = React.useCallback(() => {
    const el = ref.current;
    if (!el || !label) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    let next: Pos;
    switch (side) {
      case "bottom":
        next = { top: r.bottom + gap, left: r.left + r.width / 2, transform: "translate(-50%, 0)" };
        break;
      case "left":
        next = { top: r.top + r.height / 2, left: r.left - gap, transform: "translate(-100%, -50%)" };
        break;
      case "right":
        next = { top: r.top + r.height / 2, left: r.right + gap, transform: "translate(0, -50%)" };
        break;
      default:
        next = { top: r.top - gap, left: r.left + r.width / 2, transform: "translate(-50%, -100%)" };
    }
    setPos(next);
    setOpen(true);
  }, [label, side]);

  const show = React.useCallback(() => {
    if (touch) return;
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(place, OPEN_DELAY_MS);
  }, [touch, place]);

  const hide = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    setOpen(false);
  }, []);

  // Keyboard focus shows it straight away: someone tabbing to a control is
  // asking what it is, and has no way to "hover and wait".
  const showNow = React.useCallback(() => {
    if (touch) return;
    place();
  }, [touch, place]);

  if (!label || touch) return <>{children}</>;

  const off = OFFSET[side];

  return (
    <span
      ref={ref}
      className={cn("inline-flex", wrapperClassName)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={showNow}
      onBlurCapture={hide}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <div
                style={{ position: "fixed", top: pos.top, left: pos.left, transform: pos.transform, zIndex: 100 }}
                className="pointer-events-none"
              >
                <motion.span
                  role="tooltip"
                  initial={{ opacity: 0, scale: 0.92, x: off.x, y: off.y }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, x: off.x, y: off.y }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    "block whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md",
                    className
                  )}
                >
                  {label}
                </motion.span>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </span>
  );
}
