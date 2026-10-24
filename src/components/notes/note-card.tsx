"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconDots, IconPencil, IconPin, IconTrash } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { NOTE_COLORS, noteColorMeta, type NoteColor } from "@/lib/note-colors";
import { cn } from "@/lib/utils";

export interface NoteRow {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
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
  onSetColor: (color: NoteColor) => void;
  onDelete: () => void;
  onToggleFloat: () => void;
  floating: boolean;
}) {
  const meta = noteColorMeta(note.color);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "group flex min-h-40 cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        meta.card
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
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                  floating ? "text-primary" : "text-muted-foreground"
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
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-white/10"
                >
                  <IconDots className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  onClick={(e) => e.stopPropagation()}
                  className="z-50 w-48 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
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
                    <p className="mb-1 text-xs text-muted-foreground">Color</p>
                    <div className="flex flex-wrap gap-1.5">
                      {NOTE_COLORS.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          aria-label={c.label}
                          onClick={() => onSetColor(c.key)}
                          className={cn(
                            "h-5 w-5 rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/10",
                            c.swatch,
                            note.color === c.key && "ring-2 ring-offset-1 ring-ring"
                          )}
                        />
                      ))}
                    </div>
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

      <p className="flex-1 whitespace-pre-line text-sm text-muted-foreground line-clamp-5">
        {note.content || <span className="italic">No content</span>}
      </p>

      <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <span className="truncate">
          {showAuthor ? `${fullName(note.author)} · ` : ""}
          {timeAgo(note.updatedAt)}
        </span>
      </div>
    </div>
  );
}
