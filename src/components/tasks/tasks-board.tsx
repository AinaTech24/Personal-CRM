"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { userOptionLabel } from "@/lib/user-display";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { FilterMenu, type FilterFacet } from "@/components/ui/filter-menu";
import { facetMatches, type FilterValue } from "@/lib/filter-utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonBoard } from "@/components/ui/skeleton";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/ui/selection-bar";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { HorizontalScrollbar } from "@/components/ui/horizontal-scrollbar";
import { IconPencil, IconTrash } from "@/components/icons";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TasksListView } from "@/components/tasks/tasks-list-view";
import { useSearch } from "@/components/providers/search-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { useDragAutoScroll } from "@/hooks/use-drag-auto-scroll";
import {
  PRIORITY_OPTIONS,
  TASK_STATUSES,
  type AssignableUser,
  type TaskStatus,
  type TaskSummary,
} from "@/components/tasks/types";
import { cn } from "@/lib/utils";

/** Sentinel for the "no assignee" choice, kept distinct from a real user id. */
const UNASSIGNED = "__unassigned__";

type ViewMode = "pipeline" | "list";

const VIEW_OPTIONS = [
  { value: "pipeline", label: "Pipeline view" },
  { value: "list", label: "List view" },
];

const PRIORITY_VARIANT = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
} as const;

export function TasksBoard({ scope }: { scope?: "social-media" | "crm" } = {}) {
  const tasksUrl = scope ? `/api/tasks?scope=${scope}` : "/api/tasks";
  const { query } = useSearch();
  const { socket } = useSocket();
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [currentUserName, setCurrentUserName] = useState<string | undefined>(undefined);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | undefined>(undefined);
  const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [view, setView] = useState<ViewMode>("pipeline");
  const [filters, setFilters] = useState<{ assignee: FilterValue; status: FilterValue; priority: FilterValue }>({
    assignee: null,
    status: null,
    priority: null,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { containerRef: scrollContainerRef, onDragOver: handleBoardDragOver, stop: stopAutoScroll } =
    useDragAutoScroll<HTMLDivElement>();

  const loadTasks = useCallback(async () => {
    const res = await fetch(tasksUrl);
    const data = await res.json();
    if (res.ok) setTasks(data.tasks);
  }, [tasksUrl]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes, meRes] = await Promise.all([
        fetch(tasksUrl),
        fetch("/api/users/assignable?scope=all"),
        fetch("/api/auth/me"),
      ]);
      const [tasksData, usersData, meData] = await Promise.all([
        tasksRes.json(),
        usersRes.json(),
        meRes.json(),
      ]);
      if (tasksRes.ok) setTasks(tasksData.tasks);
      if (usersRes.ok) setAssignableUsers(usersData.users);
      if (meRes.ok) {
        setCurrentUserName(meData.user?.name);
        setCurrentUserAvatar(meData.user?.avatarDataUrl ?? null);
        setCurrentUserId(meData.user?.id ?? null);
        setCurrentUserRole(meData.user?.role);
      }
    } finally {
      setLoading(false);
    }
  }, [tasksUrl]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!socket) return;
    const onTaskChange = () => loadTasks();
    socket.on("task_created", onTaskChange);
    socket.on("task_updated", onTaskChange);
    socket.on("task_deleted", onTaskChange);
    return () => {
      socket.off("task_created", onTaskChange);
      socket.off("task_updated", onTaskChange);
      socket.off("task_deleted", onTaskChange);
    };
  }, [socket, loadTasks]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!facetMatches(filters.assignee, (v) => (v === UNASSIGNED ? task.assignedTo === null : task.assignedTo?.id === v))) {
        return false;
      }
      if (!facetMatches(filters.status, (v) => task.status === v)) return false;
      if (!facetMatches(filters.priority, (v) => task.priority === v)) return false;
      if (!q) return true;
      return [task.title, task.description].filter(Boolean).some((field) => field!.toLowerCase().includes(q));
    });
  }, [tasks, query, filters]);

  // The Social Media Team console gets multi-select within each facet (pick
  // several statuses/priorities/assignees at once); everywhere else stays
  // the original single-select behavior.
  const multiSelectFilters = !!scope;

  const filterFacets: FilterFacet[] = [
    {
      key: "assignee",
      label: "Assigned to",
      allLabel: "Anyone",
      multiple: multiSelectFilters,
      value: filters.assignee,
      onChange: (v) => setFilters((f) => ({ ...f, assignee: v })),
      options: [
        { value: UNASSIGNED, label: "Unassigned" },
        ...assignableUsers.map((u) => ({
          value: u.id,
          label: userOptionLabel(u),
          avatarDataUrl: u.avatarDataUrl,
          showAvatar: true,
        })),
      ],
    },
    {
      key: "status",
      label: "Status",
      multiple: multiSelectFilters,
      value: filters.status,
      onChange: (v) => setFilters((f) => ({ ...f, status: v })),
      options: TASK_STATUSES,
    },
    {
      key: "priority",
      label: "Priority",
      multiple: multiSelectFilters,
      value: filters.priority,
      onChange: (v) => setFilters((f) => ({ ...f, priority: v })),
      options: PRIORITY_OPTIONS,
    },
  ];

  async function moveTask(taskId: string, status: TaskStatus) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: current.status } : t)));
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllIds(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectedIds(new Set());
  }

  function handleTaskClick(task: TaskSummary) {
    if (selectedIds.size > 0) {
      toggleSelected(task.id);
    } else {
      setSelectedTask(task);
    }
  }

  async function handleBulkDelete() {
    const res = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    if (res.ok) {
      exitSelectionMode();
      await loadTasks();
    }
  }

  const isAdmin = currentUserRole === "SUPER_ADMIN" || currentUserRole === "ADMIN";
  // Edit is open to the creator and the assignee; deletion is narrower — the
  // creator or an admin. Mirrors the API's own checks; this only decides the UI.
  const canManage = (t: TaskSummary) =>
    isAdmin || t.createdBy.id === currentUserId || t.assignedTo?.id === currentUserId;
  const canDelete = (t: TaskSummary) => isAdmin || t.createdBy.id === currentUserId;

  function taskActions(task: TaskSummary): RowAction[] {
    const actions: RowAction[] = [];
    if (canManage(task)) {
      actions.push({ key: "edit", label: "Edit", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => setSelectedTask(task) });
    }
    if (canDelete(task)) {
      actions.push({
        key: "delete",
        label: "Delete",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        destructive: true,
        onSelect: () => setDeleteTarget(task),
      });
    }
    return actions;
  }

  async function deleteTask(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) await loadTasks();
  }

  const allFilteredSelected = filteredTasks.length > 0 && filteredTasks.every((t) => selectedIds.has(t.id));

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence initial={false}>
            {selectedIds.size > 0 ? (
              <SelectionBar
                key="selection"
                count={selectedIds.size}
                allSelected={allFilteredSelected}
                onSelectAll={() => toggleSelectAllIds(filteredTasks.map((t) => t.id))}
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
                className="flex items-center gap-2"
              >
                <FilterMenu facets={filterFacets} />
                <Dropdown
                  size="sm"
                  value={view}
                  onChange={(v) => setView(v as ViewMode)}
                  options={VIEW_OPTIONS}
                  className="w-40"
                />
                <NewTaskDialog
                  assignableUsers={assignableUsers}
                  assignedByName={currentUserName}
                  assignedByAvatar={currentUserAvatar}
                  onCreated={loadTasks}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {loading && <SkeletonBoard columns={4} />}

      {!loading && view === "list" && (
        <TasksListView
          tasks={filteredTasks}
          onSelect={handleTaskClick}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
          rowActions={selectedIds.size === 0 ? taskActions : undefined}
        />
      )}

      {!loading && view === "pipeline" && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div
          ref={scrollContainerRef}
          // Wheel scroll is left to the browser's default: vertical wheel
          // scrolls whichever column it's over (each has its own overflow-y),
          // and this row itself only carries horizontal overflow. Reaching
          // sideways is the HorizontalScrollbar below, not the wheel.
          className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden focus:outline-none"
          onDragOver={handleBoardDragOver}
        >
          {TASK_STATUSES.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.value);
            const isDragOver = dragOverStatus === col.value;
            const allColumnSelected = columnTasks.length > 0 && columnTasks.every((t) => selectedIds.has(t.id));
            return (
              <div
                key={col.value}
                className={cn(
                  "flex min-h-0 w-72 shrink-0 flex-col gap-2 rounded-lg p-1.5 transition-colors",
                  isDragOver && "bg-accent/60"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStatus(col.value);
                }}
                onDragLeave={() => setDragOverStatus((s) => (s === col.value ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskId = e.dataTransfer.getData("text/plain");
                  setDragOverStatus(null);
                  setDraggingId(null);
                  stopAutoScroll();
                  if (taskId) moveTask(taskId, col.value);
                }}
              >
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && columnTasks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSelectAllIds(columnTasks.map((t) => t.id))}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {allColumnSelected ? "Clear" : "All"}
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground">{columnTasks.length}</span>
                  </div>
                </div>
                {/* The column scrolls its own cards; the board's wheel handler
                    only takes over sideways once this reaches an edge. */}
                <div data-col-scroll className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                  {columnTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Card
                        draggable={selectedIds.size === 0}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(task.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStatus(null);
                          stopAutoScroll();
                        }}
                        className={cn(
                          "group select-none p-3 transition-colors hover:border-primary/40",
                          selectedIds.size === 0 && "cursor-grab active:cursor-grabbing",
                          draggingId === task.id && "opacity-30",
                          selectedIds.has(task.id) && "border-primary/60 bg-accent/40"
                        )}
                        onClick={() => handleTaskClick(task)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start">
                            {/* fade, not width: a width reveal shrinks the space
                                left for the title on hover, which can push it
                                onto a third line and grow the card under the
                                cursor. Fade keeps the box's width constant. */}
                            <HoverCheckbox
                              checked={selectedIds.has(task.id)}
                              reveal="fade"
                              onChange={() => toggleSelected(task.id)}
                              aria-label={`Select ${task.title}`}
                              wrapperClassName="mt-0.5 w-4.5 mr-2"
                            />
                            <p className="line-clamp-2 text-sm font-medium">{task.title}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
                            {selectedIds.size === 0 && (
                              <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                <RowActionsMenu actions={taskActions(task)} label={`Actions for ${task.title}`} />
                              </span>
                            )}
                          </div>
                        </div>
                        {task.dueDate && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Due {new Date(task.dueDate).toLocaleDateString()}
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{task.assignedTo ? task.assignedTo.name : "Unassigned"}</span>
                          <span>
                            {task._count.comments > 0 &&
                              `${task._count.comments} comment${task._count.comments === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                  {columnTasks.length === 0 && (
                    <p className="px-1 text-xs text-muted-foreground/60">No tasks</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <HorizontalScrollbar containerRef={scrollContainerRef} className="mx-1.5" />
        </div>
      )}

      <TaskDetailDialog
        taskId={selectedTask?.id ?? null}
        initialSummary={selectedTask}
        assignableUsers={assignableUsers}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onClose={() => setSelectedTask(null)}
        onChanged={loadTasks}
        onDeleted={() => {
          setSelectedTask(null);
          loadTasks();
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} task${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected task(s) along with their comments and attachments. This action cannot be undone."
        onConfirm={handleBulkDelete}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This permanently deletes the task along with its comments and attachments. This cannot be undone."
        onConfirm={async () => {
          if (deleteTarget) await deleteTask(deleteTarget.id);
        }}
      />
    </div>
  );
}
