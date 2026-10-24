"use client";

import { useId } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconDots, IconPalette, IconPencil, IconPin, IconTrash } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { NOTE_COLOR_PRESETS, contrastTextColor } from "@/lib/note-colors";
import { cn } from "@/lib/utils";

export interface NoteRow {
  id: string;
  title: string;
  content: string;
  color: string | null;
  isPinned: boolean;
  authorId: string;
  author: { id: string; name: string; surname: string | null; avatarDataUrl: string | null };
  departmentId: string | null;
  department: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  /** Computed client-side: can the viewer edit/delete/pin/recolor this note. */
  canManage: boolean;
}

function fullName(u: { name: string; surname: string | null }) {
  return [u.name, u.surname].filter(Boolean).join(" ");
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The color-picker row shared by the card's overflow menu and the editor dialog: preset dots + a native color-wheel picker + a reset-to-default option. */
export function ColorPickerRow({ value, onChange }: { value: string | null; onChange: (color: string | null) => void }) {
  const inputId = useId();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tooltip label="Default">
        <button
          type="button"
          aria-label="Default color"
          onClick={() => onChange(null)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 bg-card text-[10px] text-muted-foreground transition-transform hover:scale-110",
            !value && "ring-2 ring-offset-1 ring-ring"
          )}
        >
          ×
        </button>
      </Tooltip>
      {NOTE_COLOR_PRESETS.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={hex}
          onClick={() => onChange(hex)}
          style={{ backgroundColor: hex }}
          className={cn(
            "h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/10",
            value?.toLowerCase() === hex && "ring-2 ring-offset-1 ring-ring"
          )}
        />
      ))}
      <Tooltip label="Custom color">
        <label
          htmlFor={inputId}
          className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground transition-transform hover:scale-110"
        >
          <IconPalette className="h-3.5 w-3.5" />
          <input
            id={inputId}
            type="color"
            value={value ?? "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </Tooltip>
    </div>
  );
}

export function NoteCard({
  note,
  showAuthor,
  onOpen,
  onTogglePin,
  onSetColor,
  onDelete,
  onToggleFloat,
  floating,
}: {
  note: NoteRow;
  /** Admin/Department Admin views show who wrote it; your own notes don't need to say "you". */
  showAuthor: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onSetColor: (color: string | null) => void;
  onDelete: () => void;
  onToggleFloat: () => void;
  floating: boolean;
}) {
  const textColor = note.color ? contrastTextColor(note.color) : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      style={note.color ? { backgroundColor: note.color, color: textColor, borderColor: "rgba(0,0,0,0.12)" } : undefined}
      className={cn(
        "group flex min-h-40 cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        !note.color && "border-border bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold">{note.title}</h3>
        <div className="flex shrink-0 items-center gap-0.5">
          {note.isPinned && (
            <Tooltip label={floating ? "Hide floating note" : "Open as floating note"}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFloat();
                }}
                aria-label={floating ? "Hide floating note" : "Open as floating note"}
                style={textColor ? { color: textColor } : undefined}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-black/10",
                  !textColor && (floating ? "text-primary" : "text-muted-foreground")
                )}
              >
                <IconPin className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
          {note.canManage && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="Note actions"
                  onClick={(e) => e.stopPropagation()}
                  style={textColor ? { color: textColor } : undefined}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-hover:opacity-100",
                    !textColor && "text-muted-foreground"
                  )}
                >
                  <IconDots className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  onClick={(e) => e.stopPropagation()}
                  className="z-50 w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
                >
                  <DropdownMenu.Item
                    onSelect={onOpen}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5"
                  >
                    <IconPencil className="h-4 w-4" />
                    Edit
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={onTogglePin}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5"
                  >
                    <IconPin className="h-4 w-4" />
                    {note.isPinned ? "Unpin" : "Pin"}
                  </DropdownMenu.Item>
                  <div className="px-2 py-1.5">
                    <p className="mb-1.5 text-xs text-muted-foreground">Color</p>
                    <ColorPickerRow value={note.color} onChange={onSetColor} />
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item
                    onSelect={onDelete}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10"
                  >
                    <IconTrash className="h-4 w-4" />
                    Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>

      <p className={cn("flex-1 whitespace-pre-line text-sm line-clamp-5", !note.color && "text-muted-foreground")} style={textColor ? { opacity: 0.85 } : undefined}>
        {note.content || <span className="italic">No content</span>}
      </p>

      <div
        className={cn("flex items-center justify-between gap-2 pt-1 text-xs", !note.color && "text-muted-foreground")}
        style={textColor ? { opacity: 0.7 } : undefined}
      >
        <span className="truncate">
          {showAuthor ? `${fullName(note.author)} · ` : ""}
          {timeAgo(note.updatedAt)}
        </span>
      </div>
    </div>
  );
}
