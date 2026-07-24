"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A thin draggable horizontal scrollbar for a container whose native
 * scrollbar is hidden globally (see globals.css). Mirrors the container's
 * scrollLeft into a thumb, and dragging the thumb — or clicking the track —
 * scrolls the container back.
 *
 * Exists because a board that scrolls sideways but not on a plain vertical
 * wheel needs *some* discoverable way to move horizontally; a hidden native
 * scrollbar and a wheel-only gesture leaves people stuck. This makes the
 * horizontal reach visible and drag-operable, like a normal scrollbar would.
 */
export function HorizontalScrollbar({
  containerRef,
  className,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [metrics, setMetrics] = useState({ trackWidth: 0, thumbWidth: 0, thumbLeft: 0, canScroll: false });

  const measure = useCallback(() => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const trackWidth = track.clientWidth;
    const canScroll = scrollWidth > clientWidth + 1;
    // A thumb below ~28px is fiddly to grab, so it has a floor independent of
    // how small the visible fraction actually is.
    const thumbWidth = canScroll ? Math.max((clientWidth / scrollWidth) * trackWidth, 28) : trackWidth;
    const maxScrollLeft = scrollWidth - clientWidth;
    const maxThumbLeft = Math.max(trackWidth - thumbWidth, 0);
    const thumbLeft = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * maxThumbLeft : 0;
    setMetrics({ trackWidth, thumbWidth, thumbLeft, canScroll });
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(track);
    // Column contents can change height without resizing the container itself
    // (drag between statuses, filtering) — re-measure whenever the board's own
    // subtree mutates, since that can add/remove columns and change scrollWidth.
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, [containerRef, measure]);

  function onThumbPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startScrollLeft: el.scrollLeft };
  }

  function onThumbPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!el || !track || !drag || drag.pointerId !== e.pointerId) return;
    const { scrollWidth, clientWidth } = el;
    const maxScrollLeft = scrollWidth - clientWidth;
    const usableTrack = track.clientWidth - metrics.thumbWidth;
    if (usableTrack <= 0 || maxScrollLeft <= 0) return;
    const dx = e.clientX - drag.startX;
    const nextScrollLeft = drag.startScrollLeft + (dx / usableTrack) * maxScrollLeft;
    el.scrollLeft = Math.min(Math.max(nextScrollLeft, 0), maxScrollLeft);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  function onTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only the empty track, not the thumb itself (it stops propagation on its
    // own pointerdown), so this is always a "jump toward click" gesture.
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const { scrollWidth, clientWidth } = el;
    const targetScrollLeft = (clickX / rect.width) * scrollWidth - clientWidth / 2;
    el.scrollTo({ left: Math.min(Math.max(targetScrollLeft, 0), scrollWidth - clientWidth), behavior: "smooth" });
  }

  if (!metrics.canScroll) return null;

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      className={cn("relative h-2 w-full shrink-0 cursor-pointer rounded-full bg-accent/50", className)}
    >
      <div
        // Decorative drag handle, not the only way to reach horizontal
        // content — trackpad and shift+wheel still work natively on the
        // overflow-x container this mirrors — so it's hidden from AT rather
        // than exposed as an ARIA scrollbar without the element it controls.
        aria-hidden="true"
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ width: metrics.thumbWidth, transform: `translateX(${metrics.thumbLeft}px)` }}
        className="absolute inset-y-0 left-0 cursor-grab touch-none rounded-full bg-primary/40 transition-colors hover:bg-primary/60 active:cursor-grabbing active:bg-primary/70"
      />
    </div>
  );
}
