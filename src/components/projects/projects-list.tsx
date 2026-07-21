"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageLoader } from "@/components/ui/loader";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/ui/selection-bar";
import { IconDots, IconPencil, IconTrash, IconPower } from "@/components/icons";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { useSearch } from "@/components/providers/search-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import {
  PROJECT_STATUS_VARIANT,
  type AssignableUser,
  type ProjectSummary,
} from "@/components/projects/types";
import { cn } from "@/lib/utils";

interface Department {
  id: string;
  name: string;
}

interface CurrentUser {
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER";
  avatarDataUrl?: string | null;
}

function statusLabel(status: string) {
  return status.replace("_", " ");
}

export function ProjectsList() {
  const router = useRouter();
  const { query } = useSearch();
  const { socket } = useSocket();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (res.ok) setProjects(data.projects);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [projectsRes, usersRes, meRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/users/assignable"),
        fetch("/api/auth/me"),
      ]);
      const [projectsData, usersData, meData] = await Promise.all([
        projectsRes.json(),
        usersRes.json(),
        meRes.json(),
      ]);
      if (projectsRes.ok) setProjects(projectsData.projects);
      if (usersRes.ok) setAssignableUsers(usersData.users);
      if (meRes.ok) setCurrentUser(meData.user);

      const isAdmin = meData.user?.role === "SUPER_ADMIN" || meData.user?.role === "ADMIN";
      if (isAdmin) {
        const deptRes = await fetch("/api/departments");
        const deptData = await deptRes.json();
        if (deptRes.ok) setDepartments(deptData.departments);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onProjectChange = () => loadProjects();
    socket.on("project_created", onProjectChange);
    socket.on("project_updated", onProjectChange);
    socket.on("project_deleted", onProjectChange);
    return () => {
      socket.off("project_created", onProjectChange);
      socket.off("project_updated", onProjectChange);
      socket.off("project_deleted", onProjectChange);
    };
  }, [socket]);

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.name, p.description, p.department.name].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
    );
  }, [projects, query]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectedIds(new Set());
  }

  function handleProjectClick(project: ProjectSummary) {
    if (selectedIds.size > 0) {
      toggleSelected(project.id);
    } else {
      router.push(`/projects/${project.id}`);
    }
  }

  async function handleBulkDelete() {
    const res = await fetch("/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    if (res.ok) {
      exitSelectionMode();
      await loadProjects();
    }
  }

  async function toggleDisabled(project: ProjectSummary) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !project.isActive }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(project.isActive ? "Couldn't disable project" : "Couldn't enable project", data.error);
      return;
    }
    toast.success(project.isActive ? `${project.name} disabled` : `${project.name} enabled`);
    loadProjects();
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't delete project", data.error);
      return;
    }
    toast.success(`${deleteTarget.name} deleted`);
    loadProjects();
  }

  const allFilteredSelected = filteredProjects.length > 0 && filteredProjects.every((p) => selectedIds.has(p.id));

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence initial={false}>
            {selectedIds.size > 0 ? (
              <SelectionBar
                key="selection"
                count={selectedIds.size}
                allSelected={allFilteredSelected}
                onSelectAll={() =>
                  setSelectedIds((prev) => {
                    const ids = filteredProjects.map((p) => p.id);
                    const allSelected = ids.every((id) => prev.has(id));
                    const next = new Set(prev);
                    if (allSelected) ids.forEach((id) => next.delete(id));
                    else ids.forEach((id) => next.add(id));
                    return next;
                  })
                }
                onCancel={exitSelectionMode}
                onDelete={() => setConfirmOpen(true)}
              />
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <NewProjectDialog
                  isAdmin={!!isAdmin}
                  assignableUsers={assignableUsers}
                  departments={departments}
                  currentUserName={currentUser?.name ?? ""}
                  currentUserAvatar={currentUser?.avatarDataUrl ?? null}
                  onCreated={loadProjects}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {loading && <PageLoader />}

      {!loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => {
            const selected = selectedIds.has(project.id);
            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="group relative"
              >
                <Card
                  className={cn(
                    "cursor-pointer p-4 transition-colors hover:border-primary/40",
                    selected && "border-primary/60 bg-accent/40",
                    !project.isActive && "opacity-55"
                  )}
                  onClick={() => handleProjectClick(project)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start">
                      <HoverCheckbox
                        checked={selected}
                        onChange={() => toggleSelected(project.id)}
                        aria-label={`Select ${project.name}`}
                        wrapperClassName="mt-0.5"
                      />
                      <p className="truncate text-sm font-medium">{project.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!project.isActive && <Badge variant="secondary">Disabled</Badge>}
                      <Badge variant={PROJECT_STATUS_VARIANT[project.status]}>{statusLabel(project.status)}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{project.department.name}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-accent">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{project.progress}% complete</span>
                    <span>
                      {project._count.members} member{project._count.members === 1 ? "" : "s"} ·{" "}
                      {project._count.tasks} task{project._count.tasks === 1 ? "" : "s"}
                    </span>
                  </div>
                  {project.assignedTo && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Assigned to {project.assignedTo.name}</p>
                  )}
                </Card>

                {/* Admin quick actions — appear on hover */}
                {isAdmin && selectedIds.size === 0 && (
                  <div
                    className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          aria-label="Project actions"
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-card/80 text-muted-foreground backdrop-blur hover:bg-accent hover:text-foreground"
                        >
                          <IconDots className="h-4 w-4" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={6}
                          className="z-50 w-40 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
                        >
                          <DropdownMenu.Item
                            onSelect={() => setEditProject(project)}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                          >
                            <IconPencil className="h-3.5 w-3.5" />
                            Edit
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onSelect={() => toggleDisabled(project)}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                          >
                            <IconPower className="h-3.5 w-3.5" />
                            {project.isActive ? "Disable" : "Enable"}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onSelect={() => setDeleteTarget(project)}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent"
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                )}
              </motion.div>
            );
          })}
          {filteredProjects.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No projects found</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} project${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected project(s) along with their milestones, tasks, documents, and activity history. This action cannot be undone."
        onConfirm={handleBulkDelete}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        description="This permanently deletes the project along with its milestones, tasks, documents, and activity history. This cannot be undone."
        onConfirm={confirmDeleteProject}
      />

      <EditProjectDialog
        project={editProject}
        isAdmin={!!isAdmin}
        assignableUsers={assignableUsers}
        departments={departments}
        onClose={() => setEditProject(null)}
        onSaved={loadProjects}
      />
    </div>
  );
}
