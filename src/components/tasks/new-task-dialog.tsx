"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { IconPlus } from "@/components/icons";
import { PRIORITY_OPTIONS, type AssignableUser, type Priority } from "@/components/tasks/types";

export function NewTaskDialog({
  assignableUsers,
  assignedByName,
  onCreated,
}: {
  assignableUsers: AssignableUser[];
  assignedByName?: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setDueDate(null);
    setAssignedToId("");
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
          dueDate: dueDate ? dueDate.toISOString() : null,
          assignedToId: assignedToId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
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
                <Input value={assignedByName} disabled readOnly />
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
                <Label htmlFor="task-assignee">Assign to</Label>
                <Dropdown
                  id="task-assignee"
                  value={assignedToId}
                  onChange={setAssignedToId}
                  placeholder="Unassigned"
                  options={assignableUsers.map((u) => ({ value: u.id, label: u.name }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Not set" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1">
              Create task
            </Button>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
