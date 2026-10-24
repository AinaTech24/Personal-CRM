"use client";

import { useRef, useState } from "react";
import { IconChevronDown, IconChevronUp, IconPencil, IconX } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { noteColorMeta } from "@/lib/note-colors";
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
 * A pinned note, shown as a draggable panel within the Notes page's own
 * bounds (the container this is rendered into is `position: relative` and
 * exactly the page's content area — not the viewport — so a floating note
 * can never cover the sidebar/topbar or survive onto another tab). Dragging
 * is pointer-event based (no extra dependency): pointerdown on the title
 * bar starts it, pointermove on the window tracks it, pointerup ends it.
 */
export function FloatingNote({
  note,
  state,
  bounds,
  onMove,
  onToggleMinimize,
  onClose,
  onEdit,
}: {
  note: NoteRow;
  state: FloatingState;
  /** The workspace container's current size, so dragging/clamping stays correct across resizes. */
  bounds: { width: number; height: number };
  onMove: (x: number, y: number) => void;
  onToggleMinimize: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const meta = noteColorMeta(note.color);
  const width = state.minimized ? MINIMIZED_WIDTH : PANEL_WIDTH;

  function clamp(x: number, y: number) {
    const maxX = Math.max(0, bounds.width - width);
    const maxY = Math.max(0, bounds.height - 40);
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

  return (
    <div
      className={cn("absolute z-30 flex flex-col overflow-hidden rounded-lg border shadow-lg", meta.card)}
      style={{ left: state.x, top: state.y, width, height: state.minimized ? "auto" : PANEL_HEIGHT }}
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
          "flex shrink-0 cursor-grab items-center justify-between gap-1 border-b border-black/10 px-2 py-1.5 text-xs font-medium active:cursor-grabbing dark:border-white/10",
          dragging && "cursor-grabbing"
        )}
      >
        <span className="min-w-0 flex-1 truncate">{note.title || "Untitled note"}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {!state.minimized && (
            <Tooltip label="Edit" side="bottom">
              <button type="button" onClick={onEdit} aria-label="Edit note" className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10">
                <IconPencil className="h-3 w-3" />
              </button>
            </Tooltip>
          )}
          <Tooltip label={state.minimized ? "Expand" : "Minimize"} side="bottom">
            <button
              type="button"
              onClick={onToggleMinimize}
              aria-label={state.minimized ? "Expand" : "Minimize"}
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10"
            >
              {state.minimized ? <IconChevronUp className="h-3 w-3" /> : <IconChevronDown className="h-3 w-3" />}
            </button>
          </Tooltip>
          <Tooltip label="Close" side="bottom">
            <button type="button" onClick={onClose} aria-label="Close floating note" className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10">
              <IconX className="h-3 w-3" />
            </button>
          </Tooltip>
        </div>
      </div>
      {!state.minimized && (
        <div className="flex-1 overflow-y-auto p-2.5 text-xs">
          <p className="whitespace-pre-line text-muted-foreground">{note.content || <span className="italic">No content</span>}</p>
        </div>
      )}
    </div>
  );
}
