"use client";

import { useEffect, useRef, useState } from "react";
import { userOptionLabel } from "@/lib/user-display";
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
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AttachmentViewerDialog } from "@/components/tasks/attachment-viewer-dialog";
import { IconDownload, IconEye, IconLink, IconPlus, IconTrash } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import {
  TASK_STATUSES,
  PRIORITY_OPTIONS,
  taskAssignees,
  type AssignableUser,
  type TaskAttachmentItem,
  type TaskCommentItem,
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
  currentUserId,
  isAdmin = false,
  onClose,
  onChanged,
  onDeleted,
}: {
  taskId: string | null;
  initialSummary?: TaskSummary | null;
  assignableUsers: AssignableUser[];
  /** Who's viewing — decides whether the delete option shows on a comment or attachment. */
  currentUserId?: string | null;
  isAdmin?: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted?: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [description, setDescription] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingComment, setDeletingComment] = useState<TaskCommentItem | null>(null);
  const [deletingAttachment, setDeletingAttachment] = useState<TaskAttachmentItem | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{ fileName: string; filePath: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

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

  async function deleteComment(commentId: string) {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't delete comment", data.error);
    }
    setDeletingComment(null);
  }

  async function deleteAttachment(attachmentId: string) {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't delete attachment", data.error);
    }
    setDeletingAttachment(null);
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

  async function addLink() {
    const raw = linkUrl.trim();
    if (!taskId || !raw) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: raw, label: linkLabel.trim() || undefined }),
      });
      if (res.ok) {
        setLinkUrl("");
        setLinkLabel("");
        setLinkOpen(false);
        await load();
      }
    } finally {
      setUploading(false);
    }
  }

  async function deleteTask() {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return toast.error("Couldn't delete task", data.error);
    }
    onDeleted?.();
  }

  const headerTitle = task?.title ?? initialSummary?.title;
  const currentAssignees = task ? taskAssignees(task) : [];

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
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Assigned to ({currentAssignees.length})</span>
                  {currentAssignees.length > 0 && (
                    <span
                      className="truncate text-right text-xs text-muted-foreground"
                      title={currentAssignees.map((a) => a.name).join(", ")}
                    >
                      {currentAssignees.map((a) => a.name).join(", ")}
                    </span>
                  )}
                </div>
                <MultiUserSelect
                  users={assignableUsers.map((u) => ({ id: u.id, name: userOptionLabel(u) }))}
                  selectedIds={currentAssignees.map((u) => u.id)}
                  onChange={(ids) => patchTask({ assigneeIds: ids })}
                  disabled={savingField === "assigneeIds"}
                  emptyLabel="No one to assign."
                  className="max-h-40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Due date</span>
                  <DateTimePicker
                    value={task.dueDate ? new Date(task.dueDate) : null}
                    onChange={(d) => patchTask({ dueDate: d.toISOString() })}
                    placeholder="Not set"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Remind me at</span>
                  <DateTimePicker
                    value={task.remindAt ? new Date(task.remindAt) : null}
                    onChange={(d) => patchTask({ remindAt: d.toISOString() })}
                    placeholder="No reminder"
                    clearable
                    onClear={() => patchTask({ remindAt: null })}
                  />
                </div>
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
                  <div className="flex items-center gap-1.5">
                    <Tooltip label="Upload a file">
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
                    </Tooltip>
                    <Tooltip label="Attach a link instead of a file">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={uploading}
                        onClick={() => setLinkOpen((v) => !v)}
                        className="h-7 gap-1 text-xs"
                      >
                        <IconLink className="h-3.5 w-3.5" />
                        Add link
                      </Button>
                    </Tooltip>
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
                </div>

                {linkOpen && (
                  <div className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row">
                    <Input
                      autoFocus
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://example.com/doc"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
                      className="h-8 flex-1 text-xs"
                    />
                    <Input
                      value={linkLabel}
                      onChange={(e) => setLinkLabel(e.target.value)}
                      placeholder="Label (optional)"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
                      className="h-8 text-xs sm:w-36"
                    />
                    <Button type="button" size="sm" className="h-8 text-xs" onClick={addLink} disabled={uploading}>
                      Add
                    </Button>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  {task.attachments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No attachments yet</p>
                  )}
                  {task.attachments.map((a) => {
                    const canDeleteAttachment = isAdmin || a.uploadedBy.id === currentUserId;
                    return (
                    <div
                      key={a.id}
                      className="group flex items-center justify-between gap-2 rounded-md bg-accent/50 p-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate">
                          {a.url && <IconLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          {a.fileName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.url ? `${a.url} · ` : ""}
                          {a.uploadedBy.name} · {formatDate(a.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {/* A link has nothing to preview or download — it just opens. */}
                        {a.url ? (
                          <Tooltip label="Open in new tab">
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              aria-label={`Open ${a.fileName}`}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                            >
                              <IconLink className="h-4 w-4" />
                            </a>
                          </Tooltip>
                        ) : (
                        <>
                        <Tooltip label="View">
                          <button
                            type="button"
                            aria-label={`View ${a.fileName}`}
                            onClick={() => setViewingAttachment({ fileName: a.fileName, filePath: a.filePath })}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                          >
                            <IconEye className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip label="Download">
                          <a
                            href={`/api/uploads/${a.filePath}`}
                            download={a.fileName}
                            aria-label={`Download ${a.fileName}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                          >
                            <IconDownload className="h-4 w-4" />
                          </a>
                        </Tooltip>
                        </>
                        )}
                        {canDeleteAttachment && (
                          <Tooltip label="Delete attachment">
                            <button
                              type="button"
                              aria-label={`Delete ${a.fileName}`}
                              onClick={() => setDeletingAttachment(a)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    );
                  })}
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
                  {task.comments.map((c) => {
                    const canDeleteComment = isAdmin || c.author.id === currentUserId;
                    return (
                      <div key={c.id} className="group flex items-start justify-between gap-2 rounded-md bg-accent/50 p-2 text-sm">
                        <div className="min-w-0">
                          <p>{c.body}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {c.author.name} · {formatDate(c.createdAt)}
                          </p>
                        </div>
                        {canDeleteComment && (
                          <Tooltip label="Delete comment">
                            <button
                              type="button"
                              aria-label="Delete comment"
                              onClick={() => setDeletingComment(c)}
                              className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
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
    <ConfirmDialog
      open={deletingComment !== null}
      onOpenChange={(v) => !v && setDeletingComment(null)}
      title="Delete this comment?"
      description="This permanently removes the comment. This cannot be undone."
      onConfirm={async () => {
        if (deletingComment) await deleteComment(deletingComment.id);
      }}
    />
    <ConfirmDialog
      open={deletingAttachment !== null}
      onOpenChange={(v) => !v && setDeletingAttachment(null)}
      title={`Delete "${deletingAttachment?.fileName}"?`}
      description={
        deletingAttachment?.url
          ? "This removes the link from the task. This cannot be undone."
          : "This permanently removes the file from the task. This cannot be undone."
      }
      onConfirm={async () => {
        if (deletingAttachment) await deleteAttachment(deletingAttachment.id);
      }}
    />
    <AttachmentViewerDialog
      fileName={viewingAttachment?.fileName ?? null}
      fileUrl={viewingAttachment ? `/api/uploads/${viewingAttachment.filePath}?mode=view` : null}
      onClose={() => setViewingAttachment(null)}
    />
    </>
  );
}
