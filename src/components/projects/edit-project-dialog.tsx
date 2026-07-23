"use client";

import { useEffect, useState } from "react";
import { userOptionLabel } from "@/lib/user-display";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { useToast } from "@/components/providers/toast-provider";
import {
  PROJECT_STATUSES,
  type AssignableUser,
  type ProjectStatus,
  type ProjectSummary,
} from "@/components/projects/types";

interface Department {
  id: string;
  name: string;
}

export function EditProjectDialog({
  project,
  isAdmin,
  assignableUsers,
  departments,
  onClose,
  onSaved,
}: {
  project: ProjectSummary | null;
  isAdmin: boolean;
  assignableUsers: AssignableUser[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("PLANNED");
  const [departmentId, setDepartmentId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setStatus(project.status);
    setDepartmentId(project.department.id);
    setAssignedToId(project.assignedTo?.id ?? "");
  }, [project]);

  async function save() {
    if (!project) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          status,
          assignedToId: assignedToId || null,
          ...(isAdmin && departmentId ? { departmentId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't update project", data.error);
        return;
      }
      toast.success("Project updated");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-name">Name</Label>
              <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-desc">Description</Label>
              <Textarea id="ep-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep-status">Status</Label>
                <Dropdown
                  id="ep-status"
                  value={status}
                  onChange={(v) => setStatus(v as ProjectStatus)}
                  options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ep-dept">Department</Label>
                  <Dropdown
                    id="ep-dept"
                    value={departmentId}
                    onChange={setDepartmentId}
                    placeholder="Select department"
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-assigned">Assigned to</Label>
              <Dropdown
                id="ep-assigned"
                value={assignedToId}
                onChange={setAssignedToId}
                placeholder="Unassigned"
                options={assignableUsers.map((u) => ({ value: u.id, label: userOptionLabel(u), avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
