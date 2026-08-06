"use client";

import { useState } from "react";
import { userOptionLabel } from "@/lib/user-display";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserField } from "@/components/ui/user-field";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { AttachmentPicker, uploadPendingAttachments, type PendingAttachment } from "@/components/tasks/attachment-picker";
import { IconPlus } from "@/components/icons";
import { PRIORITY_OPTIONS, TASK_STATUSES, type AssignableUser, type Priority, type TaskStatus } from "@/components/tasks/types";

export function NewTaskDialog({
  assignableUsers,
  assignedByName,
  assignedByAvatar,
  onCreated,
}: {
  assignableUsers: AssignableUser[];
  assignedByName?: string;
  assignedByAvatar?: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setStatus("TODO");
    setDueDate(null);
    setRemindAt(null);
    setAssignedToId("");
    setAttachments([]);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          priority,
          status,
          dueDate: dueDate ? dueDate.toISOString() : null,
          remindAt: remindAt ? remindAt.toISOString() : null,
          assignedToId: assignedToId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      // The task had no id until now, so its attachments go up afterwards. A
      // failure here doesn't undo the task — it exists and is worth keeping.
      if (attachments.length && data.task?.id) {
        const failed = await uploadPendingAttachments(data.task.id, attachments);
        if (failed.length) {
          setError(`Task created, but these attachments failed: ${failed.join(", ")}`);
          setAttachments([]);
          onCreated();
          return;
        }
      }

      reset();
      setOpen(false);
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <IconPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {assignedByName && (
              <div className="flex flex-col gap-1.5">
                <Label>Assigned by</Label>
                <UserField name={assignedByName} avatarDataUrl={assignedByAvatar} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-priority">Priority</Label>
                <Dropdown
                  id="task-priority"
                  value={priority}
                  onChange={(v) => setPriority(v as Priority)}
                  options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-status">Status</Label>
                <Dropdown
                  id="task-status"
                  value={status}
                  onChange={(v) => setStatus(v as TaskStatus)}
                  options={TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-assignee">Assign to</Label>
                <Dropdown
                  id="task-assignee"
                  value={assignedToId}
                  onChange={setAssignedToId}
                  placeholder="Unassigned"
                  options={assignableUsers.map((u) => ({ value: u.id, label: userOptionLabel(u), avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Due date</Label>
                <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Not set" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Remind me at</Label>
              <DateTimePicker value={remindAt} onChange={setRemindAt} placeholder="No reminder" clearable onClear={() => setRemindAt(null)} />
              <p className="text-xs text-muted-foreground">
                Notifies whoever this is assigned to — toast, bell, and a push notification if the app is closed.
              </p>
            </div>

            <AttachmentPicker value={attachments} onChange={setAttachments} disabled={loading} />

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1">
              {loading && attachments.length ? "Uploading…" : "Create task"}
            </Button>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
