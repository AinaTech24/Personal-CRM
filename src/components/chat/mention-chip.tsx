"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface MentionedUser {
  id: string;
  name: string;
  surname: string | null;
  avatarDataUrl: string | null;
  role?: string;
  email?: string;
  mobile?: string | null;
  department?: { id: string; name: string } | null;
}

const SHOW_DELAY = 120;
const HIDE_DELAY = 160;
const CARD_W = 232;
/** Roughly the tallest the card gets, used to decide whether it fits above. */
const CARD_MAX_H = 150;
const GUTTER = 8;

/**
 * A highlighted @mention that reveals the person's details on hover.
 *
 * The card is portalled to the body and positioned from the chip's rect: the
 * message list scrolls and clips, so an absolutely positioned card inside a
 * bubble would be cut off at the thread edge.
 *
 * Animated with inline styles rather than utility classes or a motion library —
 * the panel stays mounted and simply fades, which is the one approach in this
 * codebase that has never left an invisible element swallowing clicks.
 */
export function MentionChip({
  label,
  user,
  mine,
}: {
  label: string;
  user?: MentionedUser;
  mine: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean; maxWidth: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }

  function show() {
    if (!user) return;
    clearTimers();
    showTimer.current = setTimeout(() => {
      const el = ref.current;
      const rect = el?.getBoundingClientRect();
      if (!el || !rect) return;

      // Stay within the message thread, not just the window. Clamping to the
      // viewport let the card sit over the sidebar or the conversation list
      // whenever the thread was narrower than the page.
      const thread = el.closest("[data-chat-thread]");
      const bounds = thread ? thread.getBoundingClientRect() : null;
      const boxLeft = bounds?.left ?? 0;
      const boxRight = bounds?.right ?? window.innerWidth;
      const boxWidth = bounds?.width ?? window.innerWidth;

      // Width first: a narrow thread shrinks the card rather than being
      // overflowed by it, and the clamp below has to use the real width.
      // No minimum: a floor wider than the thread would poke back out, which is
      // the whole thing being fixed.
      const width = Math.min(CARD_W, Math.max(0, boxWidth - GUTTER * 2));
      const minLeft = boxLeft + GUTTER;
      const maxLeft = boxRight - width - GUTTER;
      const left = Math.max(minLeft, Math.min(rect.left, Math.max(minLeft, maxLeft)));

      // Prefer above; drop below only when the top of the thread is too close.
      const roomAbove = rect.top - (bounds?.top ?? 0);
      const below = roomAbove < CARD_MAX_H + GUTTER;

      setPos({ left, top: below ? rect.bottom + 8 : rect.top - 8, below, maxWidth: width });
      setOpen(true);
    }, SHOW_DELAY);
  }

  function hide() {
    clearTimers();
    // A grace period so moving the pointer from chip to card doesn't close it.
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY);
  }

  // The card is fixed-positioned, so scrolling the thread would strand it next
  // to whichever message has slid into that spot. Close instead of chasing.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      clearTimers();
      setOpen(false);
    };
    // Capture: the thread scrolls, and scroll events don't bubble to window.
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const fullName = [user?.name, user?.surname].filter(Boolean).join(" ");

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={cn(
          // Weight alone carries it. Inside our own red bubble the primary red
          // would be invisible, so there the inherited white just goes bold.
          "font-bold",
          !mine && "text-primary",
          user && "cursor-default"
        )}
      >
        {label}
      </span>

      {user &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onMouseEnter={() => clearTimers()}
            onMouseLeave={hide}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: pos.maxWidth,
              transform: pos.below
                ? `translateY(${open ? 0 : -6}px)`
                : `translateY(${open ? "-100%" : "calc(-100% + 6px)"})`,
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition: "opacity 160ms cubic-bezier(0.16,1,0.3,1), transform 160ms cubic-bezier(0.16,1,0.3,1)",
              zIndex: 80,
            }}
            className="overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
              {user.avatarDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(user.name?.[0] ?? "?").toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{fullName}</p>
                {user.role && (
                  <p className="truncate text-[11px] capitalize text-muted-foreground">
                    {user.role.replace(/_/g, " ").toLowerCase()}
                  </p>
                )}
              </div>
            </div>
            <dl className="flex flex-col gap-1 px-3 py-2 text-[11px]">
              {user.email && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-muted-foreground">Email</dt>
                  <dd className="min-w-0 flex-1 truncate text-right">{user.email}</dd>
                </div>
              )}
              {user.mobile && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-muted-foreground">Contact</dt>
                  <dd className="min-w-0 flex-1 truncate text-right">{user.mobile}</dd>
                </div>
              )}
              {user.department?.name && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-muted-foreground">Department</dt>
                  <dd className="min-w-0 flex-1 truncate text-right">{user.department.name}</dd>
                </div>
              )}
            </dl>
          </div>,
          document.body
        )}
    </>
  );
}
