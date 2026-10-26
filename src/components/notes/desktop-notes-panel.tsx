"use client";

import { contrastTextColor } from "@/lib/note-colors";
import { IconNotes, IconPencil, IconPin } from "@/components/icons";
import type { NoteRow } from "@/components/notes/note-card";

/**
 * The content shown inside the desktop pop-out window (see
 * `src/lib/document-pip.ts`) — every currently pinned-and-floating note,
 * stacked in one window rather than as separate draggable panels, since the
 * OS window itself is what the person drags/positions now.
 */
export function DesktopNotesPanel({
  notes,
  onEdit,
  onUnpin,
}: {
  notes: NoteRow[];
  onEdit: (note: NoteRow) => void;
  onUnpin: (note: NoteRow) => void;
}) {
  return (
    <div className="flex h-screen flex-col gap-2 overflow-y-auto bg-background p-2.5 text-foreground">
      {notes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <IconNotes className="h-5 w-5" />
          <p>Pin a note to see it here.</p>
        </div>
      ) : (
        notes.map((note) => {
          const base = note.color ?? "#f4f4f5";
          const textColor = contrastTextColor(base);
          return (
            <div key={note.id} style={{ backgroundColor: base, color: textColor }} className="flex shrink-0 flex-col gap-1 rounded-lg p-2.5 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-1.5">
                <button type="button" onClick={() => onEdit(note)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline">
                  {note.title || "Untitled note"}
                </button>
                {/* Plain `title` attributes, not the shared Tooltip component — its portal
                    always targets the main window's document.body, which would misplace
                    (or silently no-op) a tooltip triggered from inside this pop-out window. */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-70">
                  <button type="button" title="Edit" onClick={() => onEdit(note)} aria-label="Edit note" className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10">
                    <IconPencil className="h-3 w-3" />
                  </button>
                  <button type="button" title="Unpin" onClick={() => onUnpin(note)} aria-label="Unpin note" className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/10">
                    <IconPin className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <p className="line-clamp-4 whitespace-pre-line text-xs opacity-90">
                {note.content || <span className="italic opacity-70">No content</span>}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
