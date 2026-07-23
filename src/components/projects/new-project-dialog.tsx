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
import { IconPlus, IconX } from "@/components/icons";
import { PROJECT_STATUSES, type AssignableUser, type ProjectStatus } from "@/components/projects/types";

interface Department {
  id: string;
  name: string;
}

export function NewProjectDialog({
  isAdmin,
  assignableUsers,
  departments,
  currentUserName,
  currentUserAvatar,
  onCreated,
}: {
  isAdmin: boolean;
  assignableUsers: AssignableUser[];
  departments: Department[];
  currentUserName: string;
  currentUserAvatar?: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("PLANNED");
  const [assignedToId, setAssignedToId] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setName("");
    setDescription("");
    setDepartmentId("");
    setStatus("PLANNED");
    setAssignedToId("");
    setStartDate(null);
    setEndDate(null);
    setMemberIds([]);
    setMemberToAdd("");
    setError(null);
  }

  function addMember() {
    if (!memberToAdd || memberIds.includes(memberToAdd)) return;
    setMemberIds((prev) => [...prev, memberToAdd]);
    setMemberToAdd("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          departmentId: departmentId || null,
          status,
          assignedToId: assignedToId || null,
          startDate: startDate ? startDate.toISOString() : null,
          endDate: endDate ? endDate.toISOString() : null,
          memberIds,
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

  const memberOptions = assignableUsers.filter((u) => !memberIds.includes(u.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <IconPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-department">Department</Label>
                  <Dropdown
                    id="project-department"
                    value={departmentId}
                    onChange={setDepartmentId}
                    placeholder="Select department"
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-status">Status</Label>
                <Dropdown
                  id="project-status"
                  value={status}
                  onChange={(v) => setStatus(v as ProjectStatus)}
                  options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-assigned-by">Assigned by</Label>
                <UserField id="project-assigned-by" name={currentUserName} avatarDataUrl={currentUserAvatar} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-assigned-to">Assigned to</Label>
                <Dropdown
                  id="project-assigned-to"
                  value={assignedToId}
                  onChange={setAssignedToId}
                  placeholder="Unassigned"
                  options={assignableUsers.map((u) => ({ value: u.id, label: userOptionLabel(u), avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Start date</Label>
                <DateTimePicker value={startDate} onChange={setStartDate} placeholder="Not set" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End date</Label>
                <DateTimePicker value={endDate} onChange={setEndDate} placeholder="Not set" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Team members</Label>
              <div className="flex gap-2">
                <Dropdown
                  value={memberToAdd}
                  onChange={setMemberToAdd}
                  placeholder="Select a member"
                  options={memberOptions.map((u) => ({ value: u.id, label: userOptionLabel(u), avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
                />
                <Button type="button" size="sm" variant="outline" onClick={addMember} className="shrink-0">
                  Add
                </Button>
              </div>
              {memberIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {memberIds.map((id) => {
                    const u = assignableUsers.find((au) => au.id === id);
                    return (
                      <span
                        key={id}
                        className="flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs"
                      >
                        {u?.name ?? id}
                        <button
                          type="button"
                          onClick={() => setMemberIds((prev) => prev.filter((m) => m !== id))}
                          aria-label={`Remove ${u?.name}`}
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
              Create project
            </Button>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
