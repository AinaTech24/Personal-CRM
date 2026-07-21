"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconPaperclip, IconLink, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Attachments chosen before the task exists.
 *
 * A new task has no id to upload against, so files and links are held here and
 * sent once the task has been created. Uploading them one by one afterwards is
 * what `uploadPendingAttachments` does.
 */
export type PendingAttachment =
  | { kind: "file"; file: File }
  | { kind: "link"; url: string; label: string };

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Sends everything collected to a task that now exists. Returns the failures so
 * the caller can say what didn't make it rather than failing the whole task.
 */
export async function uploadPendingAttachments(taskId: string, items: PendingAttachment[]) {
  const failed: string[] = [];
  for (const item of items) {
    try {
      if (item.kind === "file") {
        const form = new FormData();
        form.append("file", item.file);
        const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
        if (!res.ok) failed.push(item.file.name);
      } else {
        const res = await fetch(`/api/tasks/${taskId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.url, label: item.label }),
        });
        if (!res.ok) failed.push(item.label || item.url);
      }
    } catch {
      failed.push(item.kind === "file" ? item.file.name : item.label || item.url);
    }
  }
  return failed;
}

export function AttachmentPicker({
  value,
  onChange,
  disabled,
}: {
  value: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const tooBig = [...list].filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig.length) {
      setError(`${tooBig.map((f) => f.name).join(", ")} exceeds the 10MB limit`);
    } else {
      setError(null);
    }
    const ok = [...list].filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    onChange([...value, ...ok.map((file) => ({ kind: "file" as const, file }))]);
    // Clear so re-picking the same file still fires a change event.
    if (fileRef.current) fileRef.current.value = "";
  }

  function addLink() {
    const raw = linkUrl.trim();
    if (!raw) return;
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
      onChange([...value, { kind: "link", url: parsed.toString(), label: linkLabel.trim() || parsed.hostname }]);
      setLinkUrl("");
      setLinkLabel("");
      setLinkOpen(false);
      setError(null);
    } catch {
      setError("That doesn't look like a valid link");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Attachments</Label>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
          disabled={disabled}
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => fileRef.current?.click()} className="gap-1.5">
          <IconPaperclip className="h-4 w-4" />
          Add file
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setLinkOpen((v) => !v)} className="gap-1.5">
          <IconLink className="h-4 w-4" />
          Add link
        </Button>
      </div>

      {linkOpen && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row">
          <Input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com/doc"
            // Enter should add the link, not submit the surrounding task form.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
            className="flex-1"
          />
          <Input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label (optional)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
            className="sm:w-40"
          />
          <Button type="button" size="sm" onClick={addLink}>
            Add
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
            >
              {item.kind === "file" ? (
                <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <IconLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {item.kind === "file" ? item.file.name : item.label}
                <span className={cn("ml-1.5 text-muted-foreground")}>
                  {item.kind === "file" ? fmtBytes(item.file.size) : item.url}
                </span>
              </span>
              <button
                type="button"
                aria-label="Remove"
                disabled={disabled}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
