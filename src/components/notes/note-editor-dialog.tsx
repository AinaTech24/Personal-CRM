"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { ColorPickerRow, type NoteRow } from "@/components/notes/note-card";

export function NoteEditorDialog({
  note,
  open,
  onOpenChange,
  onSave,
}: {
  /** null while creating; the note being edited otherwise. */
  note: NoteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; content: string; color: string | null; isPinned: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Re-seed the form every time a different note opens (or the create dialog opens fresh).
  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setColor(note?.color ?? null);
    setIsPinned(note?.isPinned ?? false);
    setDirty(false);
  }, [open, note]);

  function close(next: boolean) {
    if (!next && dirty && !confirm("Discard unsaved changes to this note?")) return;
    onOpenChange(next);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content: content.trim(), color, isPinned });
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
