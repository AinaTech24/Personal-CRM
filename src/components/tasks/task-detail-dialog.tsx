"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AttachmentViewerDialog } from "@/components/tasks/attachment-viewer-dialog";
import { IconDownload, IconEye, IconPlus, IconTrash } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import {
  TASK_STATUSES,
  PRIORITY_OPTIONS,
  type AssignableUser,
  type TaskDetail,
  type TaskStatus,
  type TaskSummary,
  type Priority,
} from "@/components/tasks/types";

function formatDate(d: string) {
  return new Date(d).toLocaleString();
}

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-accent/60 ${className ?? ""}`} />;
}

export function TaskDetailDialog({
  taskId,
  initialSummary,
  assignableUsers,
  onClose,
  onChanged,
  onDeleted,
}: {
  taskId: string | null;
  initialSummary?: TaskSummary | null;
  assignableUsers: AssignableUser[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted?: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [description, setDescription] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<{ fileName: string; filePath: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (res.ok) {
      setTask(data.task);
      setDescription(data.task.description ?? "");
    }
  }

  useEffect(() => {
    setTask(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function patchTask(fields: Record<string, unknown>) {
    if (!taskId) return;
    setSavingField(Object.keys(fields)[0]);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (res.ok) {
        await load();
        onChanged();
      }
    } finally {
      setSavingField(null);
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId || !commentBody.trim()) return;
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
    if (res.ok) {
      setCommentBody("");
      await load();
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!taskId || !file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: formData });
      if (res.ok) await load();
    } finally {
      setUploading(false);
    }
  }

  async function deleteTask() {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) onDeleted?.();
  }

  const headerTitle = task?.title ?? initialSummary?.title;

  return (
    <>
    <Dialog open={!!taskId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{headerTitle ?? " "}</DialogTitle>
          <DialogDescription>Created by {task?.createdBy.name ?? initialSummary?.createdBy.name}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {!task ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-4"
            >
              <div className="grid grid-cols-3 gap-3">
                <SkeletonBar className="h-8" />
                <SkeletonBar className="h-8" />
                <SkeletonBar className="h-8" />
              </div>
              <SkeletonBar className="h-16" />
              <SkeletonBar className="h-24" />
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex flex-col gap-4"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Dropdown
                    size="sm"
                    value={task.status}
                    disabled={savingField === "status"}
                    onChange={(v) => patchTask({ status: v as TaskStatus })}
                    options={TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <Dropdown
                    size="sm"
                    value={task.priority}
                    disabled={savingField === "priority"}
                    onChange={(v) => patchTask({ priority: v as Priority })}
                    options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Assigned to</span>
                  <Dropdown
                    size="sm"
                    value={task.assignedTo?.id ?? ""}
                    disabled={savingField === "assignedToId"}
                    onChange={(v) => patchTask({ assignedToId: v || null })}
                    placeholder="Unassigned"
                    options={assignableUsers.map((u) => ({ value: u.id, label: u.name }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Due date</span>
                <DateTimePicker
                  className="w-56"
                  value={task.dueDate ? new Date(task.dueDate) : null}
                  onChange={(d) => patchTask({ dueDate: d.toISOString() })}
                  placeholder="Not set"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Description</span>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => {
                    if (description !== (task.description ?? "")) {
                      patchTask({ description: description || null });
                    }
                  }}
                  placeholder="Add a description..."
                />
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Attachments</h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                    {uploading ? "Uploading..." : "Add file"}
                  </Button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {task.attachments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No attachments yet</p>
                  )}
                  {task.attachments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-accent/50 p-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{a.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.uploadedBy.name} · {formatDate(a.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip label="View">
                          <button
                            type="button"
                            aria-label={`View ${a.fileName}`}
                            onClick={() => setViewingAttachment({ fileName: a.fileName, filePath: a.filePath })}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <IconEye className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip label="Download">
                          <a
                            href={`/api/uploads/${a.filePath}`}
                            download={a.fileName}
                            aria-label={`Download ${a.fileName}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <IconDownload className="h-4 w-4" />
                          </a>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h4 className="text-sm font-medium">Comments</h4>
                <form onSubmit={addComment} className="flex gap-2">
                  <Textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment..."
                    className="min-h-9"
                  />
                  <Button type="submit" size="sm" className="shrink-0 self-start">
                    Add
                  </Button>
                </form>
                <div className="flex flex-col gap-2">
                  {task.comments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No comments yet</p>
                  )}
                  {task.comments.map((c) => (
                    <div key={c.id} className="rounded-md bg-accent/50 p-2 text-sm">
                      <p>{c.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.author.name} · {formatDate(c.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </DialogBody>
        <DialogFooter>
          <Tooltip label="Delete task">
            <button
              type="button"
              aria-label="Delete task"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={deleteConfirmOpen}
      onOpenChange={setDeleteConfirmOpen}
      title={`Delete "${headerTitle ?? "this task"}"?`}
      description="This will permanently delete this task along with its comments and attachments. This action cannot be undone."
      onConfirm={deleteTask}
    />
    <AttachmentViewerDialog
      fileName={viewingAttachment?.fileName ?? null}
      fileUrl={viewingAttachment ? `/api/uploads/${viewingAttachment.filePath}?mode=view` : null}
      onClose={() => setViewingAttachment(null)}
    />
    </>
  );
}
