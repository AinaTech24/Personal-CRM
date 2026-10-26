"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown, IconChevronUp, IconPencil, IconX } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { contrastTextColor, rotationFor, shade, tapeColorFor } from "@/lib/note-colors";
import { cn } from "@/lib/utils";
import type { NoteRow } from "@/components/notes/note-card";

const PANEL_WIDTH = 260;
const PANEL_HEIGHT = 220;
const MINIMIZED_WIDTH = 180;

export interface FloatingState {
  x: number;
  y: number;
  minimized: boolean;
}

/**
 * A pinned note, shown as a small draggable panel — portaled to
 * `document.body` and positioned with `position: fixed` in viewport
 * coordinates, so it can be dragged anywhere on screen rather than being
 * boxed into the Notes page's own content area. It still only exists while
 * NotesView is mounted (it's plain React state, not a global store), so
 * navigating away from Notes closes every floating panel — it just isn't
 * visually clipped to a small container while the page is open. Dragging is
 * pointer-event based (no extra dependency): pointerdown on the title bar
 * starts it, pointer capture keeps tracking it even once the cursor leaves
 * the panel, pointerup ends it.
 */
export function FloatingNote({
  note,
  state,
  onMove,
  onToggleMinimize,
  onClose,
  onEdit,
}: {
  note: NoteRow;
  state: FloatingState;
  onMove: (x: number, y: number) => void;
  onToggleMinimize: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const width = state.minimized ? MINIMIZED_WIDTH : PANEL_WIDTH;
  const base = note.color ?? "#f4f4f5";
  const textColor = contrastTextColor(base);
  const tape = tapeColorFor(note.id, note.color);
  const contentBg = shade(base, note.color ? -0.08 : -0.04, 0.08);
  const tapeRotation = rotationFor(`${note.id}-tape`) * 1.6;

  function clamp(x: number, y: number) {
    const maxX = Math.max(0, window.innerWidth - width);
    const maxY = Math.max(0, window.innerHeight - 40);
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
  }

  function onPointerDown(e: React.PointerEvent) {
    // Only the title bar itself starts a drag — not its buttons.
    if ((e.target as HTMLElement).closest("button")) return;
    setDragging(true);
    dragOffset.current = { dx: e.clientX - state.x, dy: e.clientY - state.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const next = clamp(e.clientX - dragOffset.current.dx, e.clientY - dragOffset.current.dy);
    onMove(next.x, next.y);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function nudge(dx: number, dy: number) {
    const next = clamp(state.x + dx, state.y + dy);
    onMove(next.x, next.y);
  }

  const panel = (
    <div style={{ left: state.x, top: state.y, width }} className="fixed z-40 pt-3">
      {/* Washi tape — same sticky-note accent as the card this floated from. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 z-10 h-6 w-14 rounded-[2px] opacity-80 shadow-sm"
        style={{ backgroundColor: tape, transform: `translateX(-50%) rotate(${tapeRotation}deg)` }}
      />
      <div
        style={{ backgroundColor: base, color: textColor, height: state.minimized ? "auto" : PANEL_HEIGHT }}
        className="relative flex flex-col overflow-hidden rounded-xl shadow-xl"
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(e) => {
            // Keyboard-accessible alternative to dragging: arrow keys nudge the panel.
            const step = e.shiftKey ? 24 : 8;
            if (e.key === "ArrowLeft") nudge(-step, 0);
            else if (e.key === "ArrowRight") nudge(step, 0);
            else if (e.key === "ArrowUp") nudge(0, -step);
            else if (e.key === "ArrowDown") nudge(0, step);
            else return;
            e.preventDefault();
          }}
          tabIndex={0}
          role="toolbar"
          aria-label={`${note.title || "Untitled note"} — drag, or use arrow keys to move`}
          className={cn(
            "flex shrink-0 cursor-grab items-start justify-between gap-1 px-4 pb-2 pt-5 text-sm font-semibold leading-snug active:cursor-grabbing",
            dragging && "cursor-grabbing"
          )}
        >
          <span className="min-w-0 flex-1 truncate">{note.title || "Untitled note"}</span>
          <div className="flex shrink-0 items-center gap-0.5 opacity-70">
            {!state.minimized && (
              <Tooltip label="Edit" side="bottom">
                <button type="button" onClick={onEdit} aria-label="Edit note" className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10">
                  <IconPencil className="h-3 w-3" />
                </button>
              </Tooltip>
            )}
            <Tooltip label={state.minimized ? "Expand" : "Minimize"} side="bottom">
              <button
                type="button"
                onClick={onToggleMinimize}
                aria-label={state.minimized ? "Expand" : "Minimize"}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10"
              >
                {state.minimized ? <IconChevronUp className="h-3 w-3" /> : <IconChevronDown className="h-3 w-3" />}
              </button>
            </Tooltip>
            <Tooltip label="Close" side="bottom">
              <button type="button" onClick={onClose} aria-label="Close floating note" className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10">
                <IconX className="h-3 w-3" />
              </button>
            </Tooltip>
          </div>
        </div>
        {!state.minimized && (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="h-full rounded-lg p-3 text-xs" style={{ backgroundColor: contentBg }}>
              <p className="whitespace-pre-line">{note.content || <span className="italic opacity-70">No content</span>}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}
