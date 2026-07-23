"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonForm } from "@/components/ui/skeleton";
import {
  IconChevronLeft,
  IconDownload,
  IconEye,
  IconPlus,
  IconTrash,
  IconX,
} from "@/components/icons";
import { AttachmentViewerDialog } from "@/components/tasks/attachment-viewer-dialog";
import { NewProjectTaskDialog } from "@/components/projects/new-project-task-dialog";
import { ProjectSupportersCard } from "@/components/projects/project-supporters-card";
import { ProjectTimePanel } from "@/components/projects/project-time-panel";
import { useSocket } from "@/components/providers/socket-provider";
import { formatDuration } from "@/lib/project-time";
import { useToast } from "@/components/providers/toast-provider";
import {
  MILESTONE_STATUSES,
  PROJECT_STATUSES,
  PROJECT_STATUS_VARIANT,
  PROJECT_TASK_STATUSES,
  type AssignableUser,
  type MilestoneStatus,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectTaskItem,
  type ProjectTaskStatus,
} from "@/components/projects/types";
import { cn } from "@/lib/utils";

function formatDate(d: string) {
  return new Date(d).toLocaleString();
}

function activityLabel(a: { action: string; meta: Record<string, unknown> | null; actor: { name: string } }) {
  switch (a.action) {
    case "created":
      return `${a.actor.name} created this project`;
    case "status_changed":
      return `${a.actor.name} changed status: ${a.meta?.from} → ${a.meta?.to}`;
    case "member_added":
      return `${a.actor.name} added a team member`;
    case "member_removed":
      return `${a.actor.name} removed a team member`;
    case "supporter_added":
      return `${a.actor.name} added ${a.meta?.name ?? "someone"} as a supporter${a.meta?.role ? ` (${a.meta.role})` : ""}`;
    case "supporter_removed":
      return `${a.actor.name} removed ${a.meta?.name ?? "someone"} from supporters`;
    case "time_logged":
      return `${a.actor.name} logged ${formatDuration(Number(a.meta?.minutes) || 0)} for ${a.meta?.name ?? "someone"}`;
    case "time_removed":
      return `${a.actor.name} removed a ${formatDuration(Number(a.meta?.minutes) || 0)} entry`;
    case "milestone_added":
      return `${a.actor.name} added milestone "${a.meta?.title}"`;
    case "milestone_completed":
      return `${a.actor.name} completed milestone "${a.meta?.title}"`;
    case "task_added":
      return `${a.actor.name} added task "${a.meta?.title}"`;
    case "task_status_changed":
      return `${a.actor.name} changed task "${a.meta?.title}": ${a.meta?.from} → ${a.meta?.to}`;
    case "task_removed":
      return `${a.actor.name} removed a task`;
    case "document_added":
      return `${a.actor.name} uploaded "${a.meta?.fileName}"`;
    default:
      return `${a.actor.name}: ${a.action}`;
  }
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { socket } = useSocket();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDue, setMilestoneDue] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addFileOpen, setAddFileOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<{ fileName: string; filePath: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    if (res.ok) setProject(data.project);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [projectRes, usersRes, meRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch("/api/users/assignable"),
        fetch("/api/auth/me"),
      ]);
      const [projectData, usersData, meData] = await Promise.all([
        projectRes.json(),
        usersRes.json(),
        meRes.json(),
      ]);
      if (projectRes.ok) setProject(projectData.project);
      if (usersRes.ok) setAssignableUsers(usersData.users);
      // Pre-selects the logger in the time form: most entries are your own.
      if (meRes.ok) setCurrentUserId(meData.user?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!socket) return;
    const onChange = (payload: { projectId?: string }) => {
      if (payload?.projectId === projectId) load();
    };
    socket.on("project_updated", onChange);
    return () => {
      socket.off("project_updated", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, projectId]);

  async function patchProject(fields: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) await load();
  }

  async function deleteProject() {
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Project deleted");
      router.push("/projects");
    } else {
      toast.error("Couldn't delete project");
    }
  }

  async function addMember() {
    if (!memberToAdd) return;
    setMemberError(null);
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: memberToAdd }),
    });
    if (res.ok) {
      setMemberToAdd("");
      await load();
      toast.success("Member added");
    } else {
      const data = await res.json().catch(() => ({}));
      setMemberError(data.error ?? "Couldn't add member");
      toast.error("Couldn't add member", data.error);
    }
  }

  async function removeMember(userId: string) {
    setMemberError(null);
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      toast.success("Member removed");
    } else {
      const data = await res.json().catch(() => ({}));
      setMemberError(data.error ?? "Couldn't remove member — you may not have permission");
      toast.error("Couldn't remove member", data.error);
    }
  }

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!milestoneTitle.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: milestoneTitle, dueDate: milestoneDue ? milestoneDue.toISOString() : null }),
    });
    if (res.ok) {
      setMilestoneTitle("");
      setMilestoneDue(null);
      await load();
    }
  }

  async function setMilestoneStatus(milestoneId: string, status: MilestoneStatus) {
    const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await load();
  }

  async function patchProjectTask(taskId: string, fields: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) await load();
  }

  async function deleteProjectTask(taskId: string) {
    const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function uploadDocument() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      if (docName.trim()) formData.append("fileName", docName.trim());
      const res = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", body: formData });
      if (res.ok) {
        setPendingFile(null);
        setDocName("");
        setAddFileOpen(false);
        await load();
      }
    } finally {
      setUploading(false);
    }
  }

  if (loading || !project) return <SkeletonForm fields={6} />;

  const memberOptions = assignableUsers.filter((u) => !project.members.some((m) => m.user.id === u.id));

  // Group project tasks so subtasks render nested under their parent.
  const topLevelTasks = project.tasks.filter((t) => !t.parentTaskId);
  const subtasksByParent = new Map<string, ProjectTaskItem[]>();
  for (const t of project.tasks) {
    if (t.parentTaskId) {
      const list = subtasksByParent.get(t.parentTaskId) ?? [];
      list.push(t);
      subtasksByParent.set(t.parentTaskId, list);
    }
  }

  function renderTaskRow(t: ProjectTaskItem, isSubtask: boolean) {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-accent/50 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">
              {isSubtask && <span className="text-xs text-muted-foreground">↳ Subtask · </span>}
              {t.title}
            </p>
            {t.assignedBy && (
              <p className="text-xs text-muted-foreground">
                Assigned by {t.assignedBy.name}
                {/* Only when they differ — on the usual path the two are the same
                    person and naming them twice is noise. */}
                {t.createdBy && t.createdBy.id !== t.assignedBy.id && ` · raised by ${t.createdBy.name}`}
              </p>
            )}
            {t.dependsOn.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Depends on: {t.dependsOn.map((d) => d.dependsOnTask.title).join(", ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => deleteProjectTask(t.id)}
            aria-label={`Delete ${t.title}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <IconTrash className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dropdown
            size="sm"
            value={t.status}
            onChange={(v) => patchProjectTask(t.id, { status: v as ProjectTaskStatus })}
            options={PROJECT_TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          />
          <Dropdown
            size="sm"
            value={t.assignedTo?.id ?? ""}
            onChange={(v) => patchProjectTask(t.id, { assignedToId: v || null })}
            placeholder="Unassigned"
            emptyMessage="No members"
            options={assignableUsers.map((u) => ({ value: u.id, label: u.name, avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
          />
          <DateTimePicker
            className="text-xs"
            value={t.dueDate ? new Date(t.dueDate) : null}
            onChange={(d) => patchProjectTask(t.id, { dueDate: d.toISOString() })}
            placeholder="Due date"
          />
          <Input
            type="number"
            min={0}
            max={100}
            defaultValue={t.progressPct}
            onBlur={(e) => {
              const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              if (value !== t.progressPct) patchProjectTask(t.id, { progressPct: value });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="h-4 w-4" />
          Projects
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {project.department.name} · Created by {project.createdBy.name}
            </p>
          </div>
          <Badge variant={PROJECT_STATUS_VARIANT[project.status]}>{project.status.replace("_", " ")}</Badge>
        </div>
        {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Status</span>
            <Dropdown
              size="sm"
              value={project.status}
              onChange={(v) => patchProject({ status: v as ProjectStatus })}
              options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Progress (%)</span>
            <Input
              type="number"
              min={0}
              max={100}
              defaultValue={project.progress}
              onBlur={(e) => {
                const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                if (value !== project.progress) patchProject({ progress: value });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Start date</span>
            <DateTimePicker
              value={project.startDate ? new Date(project.startDate) : null}
              onChange={(d) => patchProject({ startDate: d.toISOString() })}
              placeholder="Not set"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">End date</span>
            <DateTimePicker
              value={project.endDate ? new Date(project.endDate) : null}
              onChange={(d) => patchProject({ endDate: d.toISOString() })}
              placeholder="Not set"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Budgeted hours</span>
            <Input
              type="number"
              min={0}
              placeholder="Not set"
              defaultValue={project.estimatedHours ?? ""}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                // Empty clears the budget rather than storing 0, which would
                // read as "budgeted for no time at all".
                const value = raw === "" ? null : Math.max(0, Number(raw) || 0);
                if (value !== project.estimatedHours) patchProject({ estimatedHours: value });
              }}
            />
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      {/* Two explicit columns rather than a 3-cell grid. In the grid, a short
          Supporters card in the top-right left the cell beneath it (under
          Milestones' row) empty — a large dead gap. Stacking Supporters and
          Milestones together in the right column fills it and keeps the two
          columns close in height. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="lg:flex-1">
          <CardHeader>
            <CardTitle className="text-base">Team members</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Dropdown
                size="sm"
                value={memberToAdd}
                onChange={setMemberToAdd}
                placeholder="Select a member"
                emptyMessage="Everyone's already added"
                options={memberOptions.map((u) => ({ value: u.id, label: u.name, avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
              />
              <Button type="button" size="sm" variant="outline" onClick={addMember} className="shrink-0">
                Add
              </Button>
            </div>
            {memberError && <p className="text-xs text-destructive">{memberError}</p>}
            <div className="flex flex-col gap-1.5">
              {project.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md bg-accent/50 px-2 py-1.5 text-sm">
                  <span>
                    {m.user.name}
                    {m.role === "owner" && <span className="ml-1.5 text-xs text-muted-foreground">(owner)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMember(m.user.id)}
                    aria-label={`Remove ${m.user.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {project.members.length === 0 && (
                <p className="text-xs text-muted-foreground">No members yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:flex-1">
          <ProjectSupportersCard project={project} assignableUsers={assignableUsers} onChanged={load} />

          <Card>
          <CardHeader>
            <CardTitle className="text-base">Milestones</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form onSubmit={addMilestone} className="flex gap-2">
              <Input
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                placeholder="Milestone title"
                className="flex-1"
              />
              <DateTimePicker className="w-40 shrink-0" value={milestoneDue} onChange={setMilestoneDue} placeholder="Due date" />
              <Button type="submit" size="sm" className="shrink-0">
                Add
              </Button>
            </form>
            <div className="flex flex-col gap-1.5">
              {project.milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-md bg-accent/50 px-2 py-1.5 text-sm">
                  <span className={cn("min-w-0 flex-1 truncate", m.status === "DONE" && "text-muted-foreground line-through")}>
                    {m.title}
                  </span>
                  <span className="flex-1 text-center text-xs text-muted-foreground">
                    {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}
                  </span>
                  <div className="flex flex-1 justify-end">
                    <Dropdown
                      size="sm"
                      className="w-28"
                      value={m.status}
                      onChange={(v) => setMilestoneStatus(m.id, v as MilestoneStatus)}
                      options={MILESTONE_STATUSES}
                    />
                  </div>
                </div>
              ))}
              {project.milestones.length === 0 && (
                <p className="text-xs text-muted-foreground">No milestones yet</p>
              )}
            </div>
          </CardContent>
          </Card>
        </div>
      </div>

      <ProjectTimePanel
        project={project}
        assignableUsers={assignableUsers}
        currentUserId={currentUserId}
        onChanged={load}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Project tasks</CardTitle>
          <NewProjectTaskDialog
            projectId={projectId}
            milestones={project.milestones}
            tasks={project.tasks}
            assignableUsers={assignableUsers}
            currentUserId={currentUserId}
            onCreated={load}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {topLevelTasks.map((t) => (
            <div key={t.id} className="flex flex-col gap-2">
              {renderTaskRow(t, false)}
              {subtasksByParent.get(t.id)?.map((sub) => (
                <div key={sub.id} className="ml-5 border-l-2 border-border pl-3">
                  {renderTaskRow(sub, true)}
                </div>
              ))}
            </div>
          ))}
          {project.tasks.length === 0 && <p className="text-xs text-muted-foreground">No project tasks yet</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <Popover.Root open={addFileOpen} onOpenChange={(v) => { setAddFileOpen(v); if (!v) { setPendingFile(null); setDocName(""); } }}>
            <Popover.Trigger asChild>
              <Button type="button" size="sm" variant="outline" className="gap-1.5">
                <IconPlus className="h-3.5 w-3.5" />
                Add file
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={6}
                className="z-50 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Document</Label>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm text-muted-foreground hover:bg-primary/5"
                    >
                      <IconPlus className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{pendingFile ? pendingFile.name : "Choose a file…"}</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => { setPendingFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="doc-name">Document name (optional)</Label>
                    <Input
                      id="doc-name"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder={pendingFile?.name ?? "e.g. Signed contract"}
                    />
                  </div>
                  <Button type="button" size="sm" disabled={!pendingFile || uploading} onClick={uploadDocument}>
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {project.documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-accent/50 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{d.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {d.uploadedBy.name} · {formatDate(d.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`View ${d.fileName}`}
                  onClick={() => setViewingAttachment({ fileName: d.fileName, filePath: d.filePath })}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                >
                  <IconEye className="h-4 w-4" />
                </button>
                <a
                  href={`/api/uploads/${d.filePath}`}
                  download={d.fileName}
                  aria-label={`Download ${d.fileName}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                >
                  <IconDownload className="h-4 w-4" />
                </a>
              </div>
            </div>
          ))}
          {project.documents.length === 0 && (
            <p className="text-xs text-muted-foreground">No documents yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {project.activities.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{activityLabel(a)}</span>
              <span className="shrink-0">{formatDate(a.createdAt)}</span>
            </div>
          ))}
          {project.activities.length === 0 && <p className="text-xs text-muted-foreground">No activity yet</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          aria-label="Delete project"
          onClick={() => setDeleteConfirmOpen(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-destructive opacity-80 transition-opacity hover:opacity-100"
        >
          <IconTrash className="h-4 w-4" />
          Delete project
        </button>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete "${project.name}"?`}
        description="This will permanently delete this project along with its members, milestones, tasks, documents, and activity history. This action cannot be undone."
        onConfirm={deleteProject}
      />

      <AttachmentViewerDialog
        fileName={viewingAttachment?.fileName ?? null}
        fileUrl={viewingAttachment ? `/api/uploads/${viewingAttachment.filePath}?mode=view` : null}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  );
}
