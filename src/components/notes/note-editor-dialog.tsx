"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { IconX } from "@/components/icons";
import { ColorPickerRow, type NoteRow } from "@/components/notes/note-card";
import { MAX_TAGS, MAX_TAG_LENGTH } from "@/lib/note-tags";

/** A chip-style tag input: type and press Enter/comma to add, click a chip's × (or Backspace on an empty draft) to remove. `suggestions` feeds a native datalist so a previously-used tag autocompletes instead of having to be retyped exactly. */
function TagsEditor({ value, onChange, suggestions }: { value: string[]; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || value.length >= MAX_TAGS || value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  const atLimit = value.length >= MAX_TAGS;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove tag "${tag}"`}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconX className="h-3 w-3" />
          </button>
        </span>
      ))}
      {!atLimit && (
        <input
          list="note-tag-suggestions"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(draft);
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          onBlur={() => draft && addTag(draft)}
          placeholder={value.length === 0 ? "Add a tag…" : "Add another…"}
          className="min-w-[7rem] flex-1 border-none bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground"
        />
      )}
      <datalist id="note-tag-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

export function NoteEditorDialog({
  note,
  open,
  onOpenChange,
  onSave,
  tagSuggestions = [],
}: {
  /** null while creating; the note being edited otherwise. */
  note: NoteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; content: string; color: string | null; isPinned: boolean; tags: string[] }) => Promise<void>;
  /** Tags already used elsewhere, offered as autocomplete so the same idea doesn't end up spelled two different ways. */
  tagSuggestions?: string[];
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Re-seed the form every time a different note opens (or the create dialog opens fresh).
  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setColor(note?.color ?? null);
    setIsPinned(note?.isPinned ?? false);
    setTags(note?.tags ?? []);
    setDirty(false);
  }, [open, note]);

  function close(next: boolean) {
    if (!next && dirty && !confirm("Discard unsaved changes to this note?")) return;
    onOpenChange(next);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content: content.trim(), color, isPinned, tags });
      setDirty(false);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !!note && !note.canManage;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{note ? (readOnly ? "Note" : "Edit note") : "New note"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="Title"
            disabled={readOnly}
            className="h-auto border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          />
          <Textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            placeholder="Write something…"
            disabled={readOnly}
            rows={10}
            className="resize-none border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          {readOnly && note && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
              {note.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-1 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {!readOnly && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Tags</span>
              <TagsEditor
                value={tags}
                onChange={(t) => {
                  setTags(t);
                  setDirty(true);
                }}
                suggestions={tagSuggestions}
              />
            </div>
          )}
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <ColorPickerRow
                value={color}
                onChange={(c) => {
                  setColor(c);
                  setDirty(true);
                }}
              />
              <label className="flex items-center gap-2 text-sm">
                <ToggleSwitch
                  checked={isPinned}
                  onChange={(v) => {
                    setIsPinned(v);
                    setDirty(true);
                  }}
                />
                Pinned
              </label>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={saving}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button type="button" onClick={save} disabled={saving || (!title.trim() && !content.trim())}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
