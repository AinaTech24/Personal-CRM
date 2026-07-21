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
import { IconPlus, IconX } from "@/components/icons";
import type { AssignableUser, MilestoneItem, ProjectTaskItem } from "@/components/projects/types";

export function NewProjectTaskDialog({
  projectId,
  milestones,
  tasks,
  assignableUsers,
  onCreated,
}: {
  projectId: string;
  milestones: MilestoneItem[];
  tasks: ProjectTaskItem[];
  assignableUsers: AssignableUser[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dependsOnIds, setDependsOnIds] = useState<string[]>([]);
  const [dependencyToAdd, setDependencyToAdd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setMilestoneId("");
    setParentTaskId("");
    setAssignedToId("");
    setDueDate(null);
    setDependsOnIds([]);
    setDependencyToAdd("");
    setError(null);
  }

  function addDependency() {
    if (!dependencyToAdd || dependsOnIds.includes(dependencyToAdd)) return;
    setDependsOnIds((prev) => [...prev, dependencyToAdd]);
    setDependencyToAdd("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          milestoneId: milestoneId || null,
          parentTaskId: parentTaskId || null,
          assignedToId: assignedToId || null,
          dueDate: dueDate ? dueDate.toISOString() : null,
          dependsOnIds,
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

  const dependencyOptions = tasks.filter((t) => !dependsOnIds.includes(t.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <IconPlus className="h-4 w-4" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New project task</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pt-title">Title</Label>
              <Input id="pt-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pt-description">Description</Label>
              <Textarea id="pt-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-assignee">Assign to</Label>
                <Dropdown
                  id="pt-assignee"
                  value={assignedToId}
                  onChange={setAssignedToId}
                  placeholder="Unassigned"
                  options={assignableUsers.map((u) => ({ value: u.id, label: u.name, avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Due date</Label>
                <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Not set" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-milestone">Milestone</Label>
                <Dropdown
                  id="pt-milestone"
                  value={milestoneId}
                  onChange={setMilestoneId}
                  placeholder="None"
                  options={milestones.map((m) => ({ value: m.id, label: m.title }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-parent">Parent task (make this a subtask)</Label>
                <Dropdown
                  id="pt-parent"
                  value={parentTaskId}
                  onChange={setParentTaskId}
                  placeholder="None"
                  options={tasks.map((t) => ({ value: t.id, label: t.title }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Depends on</Label>
              <div className="flex gap-2">
                <Dropdown
                  value={dependencyToAdd}
                  onChange={setDependencyToAdd}
                  placeholder="Select a task"
                  options={dependencyOptions.map((t) => ({ value: t.id, label: t.title }))}
                />
                <Button type="button" size="sm" variant="outline" onClick={addDependency} className="shrink-0">
                  Add
                </Button>
              </div>
              {dependsOnIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {dependsOnIds.map((id) => {
                    const t = tasks.find((tt) => tt.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs">
                        {t?.title ?? id}
                        <button
                          type="button"
                          onClick={() => setDependsOnIds((prev) => prev.filter((d) => d !== id))}
                          aria-label={`Remove ${t?.title}`}
                        >
                          <IconX className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
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
