"use client";

import { useCallback, useEffect, useState } from "react";
import { userOptionLabel } from "@/lib/user-display";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { FilterMenu, type FilterFacet } from "@/components/ui/filter-menu";
import { filterValueToParam, UNASSIGNED, type FilterValue } from "@/lib/filter-utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonBoard } from "@/components/ui/skeleton";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/ui/selection-bar";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { HorizontalScrollbar } from "@/components/ui/horizontal-scrollbar";
import { RecencyBadge } from "@/components/ui/recency-badge";
import { IconPencil, IconTrash, IconBell, IconCopy } from "@/components/icons";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TasksListView } from "@/components/tasks/tasks-list-view";
import { GlobalSearchBar } from "@/components/layout/global-search-bar";
import { useSearch } from "@/components/providers/search-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { useDragAutoScroll } from "@/hooks/use-drag-auto-scroll";
import {
  PRIORITY_OPTIONS,
  TASK_STATUSES,
  taskAssignees,
  type AssignableUser,
  type TaskStatus,
  type TaskSummary,
} from "@/components/tasks/types";
import { cn } from "@/lib/utils";
import { PRIORITY_VARIANT } from "@/lib/priority";

/** How many tasks a single fetch loads — both the initial page and each "Load more". */
const PAGE_SIZE = 50;

type ViewMode = "pipeline" | "list";

const VIEW_OPTIONS = [
  { value: "pipeline", label: "Pipeline view" },
  { value: "list", label: "List view" },
];

/** Builds the Tasks list query string — shared by the initial/filtered fetch and "Load more", so both always agree on what's currently being searched for. */
function tasksSearchParams(opts: {
  scope?: string;
  filters: { assignee: FilterValue; status: FilterValue; priority: FilterValue };
  q: string;
  take: number;
  skip: number;
}) {
  const params = new URLSearchParams();
  if (opts.scope) params.set("scope", opts.scope);
  const assignee = filterValueToParam(opts.filters.assignee);
  if (assignee) params.set("assignee", assignee);
  const status = filterValueToParam(opts.filters.status);
  if (status) params.set("status", status);
  const priority = filterValueToParam(opts.filters.priority);
  if (priority) params.set("priority", priority);
  if (opts.q) params.set("q", opts.q);
  params.set("take", String(opts.take));
  if (opts.skip) params.set("skip", String(opts.skip));
  return params.toString();
}

export function TasksBoard({ scope }: { scope?: "social-media" | "crm" | `team:${string}` } = {}) {
  const { query } = useSearch();
  const toast = useToast();
  const { socket } = useSocket();
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [currentUserName, setCurrentUserName] = useState<string | undefined>(undefined);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | undefined>(undefined);
  const [hasTasksGrant, setHasTasksGrant] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
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

  // Debounced so free-text search (typed into the shared header search bar)
  // doesn't fire a request per keystroke.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // The one reactive fetch: re-runs (resetting to the first page) whenever
  // the scope, a filter, or the search query changes — search/filtering now
  // happens server-side, so this is also what makes "Load more" safe: a
  // later page can never contain something an earlier page's filter should
  // have excluded. `take` lets a live-update/post-mutation refresh ask for
  // as many as were already loaded, instead of collapsing back to page one.
  const loadTasks = useCallback(
    async (take: number = PAGE_SIZE) => {
      setLoading(true);
      try {
        const qs = tasksSearchParams({ scope, filters, q, take: Math.max(take, PAGE_SIZE), skip: 0 });
        const res = await fetch(`/api/tasks?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setTasks(data.tasks ?? []);
          setTotal(data.total ?? 0);
          setHasMore(!!data.hasMore);
          setForbidden(false);
        } else if (scope && res.status === 403) {
          setForbidden(true);
        } else {
          toast.error("Couldn't load tasks", data.error);
        }
      } catch {
        toast.error("Couldn't load tasks", "Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [scope, filters, q] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function loadMoreTasks() {
    setLoadingMore(true);
    try {
      const qs = tasksSearchParams({ scope, filters, q, take: PAGE_SIZE, skip: tasks.length });
      const res = await fetch(`/api/tasks?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load more tasks", data.error);
      setTasks((prev) => [...prev, ...(data.tasks ?? [])]);
      setTotal(data.total ?? 0);
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  // A live update or a mutation (duplicate, delete, an edit) re-fetches in
  // place — preserving however many tasks were already loaded (via "Load
  // more"), rather than collapsing the list back to page one.
  function refreshTasks() {
    return loadTasks(tasks.length);
  }

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Assignable users and the current user don't depend on any filter —
  // loaded once, not re-fetched every time a filter changes.
  useEffect(() => {
    (async () => {
      try {
        const [usersRes, meRes] = await Promise.all([fetch("/api/users/assignable?scope=all"), fetch("/api/auth/me")]);
        const [usersData, meData] = await Promise.all([usersRes.json().catch(() => ({})), meRes.json().catch(() => ({}))]);
        if (usersRes.ok) setAssignableUsers(usersData.users);
        if (meRes.ok) {
          setCurrentUserName(meData.user?.name);
          setCurrentUserAvatar(meData.user?.avatarDataUrl ?? null);
          setCurrentUserId(meData.user?.id ?? null);
          setCurrentUserRole(meData.user?.role);
          setHasTasksGrant(!!meData.user?.modulePermissions?.includes("TASKS"));
        }
      } catch {
        // The tasks fetch itself already surfaces a connection-error toast.
      }
    })();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onTaskChange = () => refreshTasks();
    socket.on("task_created", onTaskChange);
    socket.on("task_updated", onTaskChange);
    socket.on("task_deleted", onTaskChange);
    return () => {
      socket.off("task_created", onTaskChange);
      socket.off("task_updated", onTaskChange);
      socket.off("task_deleted", onTaskChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, tasks.length]);

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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return toast.error("Couldn't delete", data.error);
    }
    exitSelectionMode();
    await refreshTasks();
  }

  const isAdmin = currentUserRole === "SUPER_ADMIN" || currentUserRole === "ADMIN";
  // A Tasks module grant manages/deletes every task, same as an admin.
  const fullAccess = isAdmin || hasTasksGrant;
  // Edit is open to the creator and the assignee; deletion is narrower — the
  // creator or an admin. Mirrors the API's own checks; this only decides the UI.
  const canManage = (t: TaskSummary) =>
    fullAccess || t.createdBy.id === currentUserId || taskAssignees(t).some((a) => a.id === currentUserId);
  const canDelete = (t: TaskSummary) => fullAccess || t.createdBy.id === currentUserId;

  async function remindTask(task: TaskSummary) {
    const res = await fetch(`/api/tasks/${task.id}/remind`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't send the reminder", data.error);
    toast.success("Reminder sent", taskAssignees(task).map((a) => a.name).join(", "));
  }

  async function duplicateTask(task: TaskSummary) {
    const res = await fetch(`/api/tasks/${task.id}/duplicate`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't duplicate the task", data.error);
    toast.success("Task duplicated");
    await refreshTasks();
  }

  function taskActions(task: TaskSummary): RowAction[] {
    const actions: RowAction[] = [];
    if (canManage(task)) {
      actions.push({ key: "edit", label: "Edit", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => setSelectedTask(task) });
      actions.push({ key: "duplicate", label: "Duplicate", icon: <IconCopy className="h-3.5 w-3.5" />, onSelect: () => duplicateTask(task) });
    }
    if (fullAccess && taskAssignees(task).some((a) => a.id !== currentUserId)) {
      actions.push({ key: "remind", label: "Send reminder", icon: <IconBell className="h-3.5 w-3.5" />, onSelect: () => remindTask(task) });
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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return toast.error("Couldn't delete task", data.error);
    }
    await refreshTasks();
  }

  // "Select all" covers whatever's currently loaded, not necessarily every
  // task matching the filters — same convention as Gmail et al: paginated
  // lists select the loaded page, not silently everything that matches.
  const allTasksSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));

  if (forbidden) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-1 py-16 text-center">
        <p className="text-sm font-medium">You don&apos;t have access to this team&apos;s Tasks</p>
        <p className="text-sm text-muted-foreground">Ask your team lead or a company admin for access.</p>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Tasks</h1>
          <HelpDialog title="Tasks — help">
            <HelpSection heading="What this page is for">
              <p>A Kanban board for work items — create a task, assign one or more people, and drag it between status columns as it progresses.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>See and manage every task across every department.</p>
            </HelpSection>
            <HelpSection heading="Department Admins & Permission grants">
              <p>A Department Admin sees only what they&apos;re explicitly granted (Permissions → Tasks) — their own department by default, or every department if a company Admin turned on &quot;All departments&quot; for them.</p>
            </HelpSection>
            <HelpSection heading="Team leads">
              <p>A team lead additionally sees every task created by, or assigned to, anyone on their team.</p>
            </HelpSection>
            <HelpSection heading="Everyone else">
              <p>You see tasks you created or are assigned to (including as one of several assignees).</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearchBar placeholder="Search tasks…" />
          <AnimatePresence initial={false}>
            {selectedIds.size > 0 ? (
              <SelectionBar
                key="selection"
                count={selectedIds.size}
                allSelected={allTasksSelected}
                onSelectAll={() => toggleSelectAllIds(tasks.map((t) => t.id))}
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
                  onCreated={refreshTasks}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {loading && <SkeletonBoard columns={4} />}

      {!loading && view === "list" && (
        <TasksListView
          tasks={tasks}
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
            const columnTasks = tasks.filter((t) => t.status === col.value);
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
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">
                            {taskAssignees(task).length > 0
                              ? taskAssignees(task).map((a) => a.name).join(", ")
                              : "Unassigned"}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {task._count.comments > 0 &&
                              `${task._count.comments} comment${task._count.comments === 1 ? "" : "s"}`}
                            <RecencyBadge createdAt={task.createdAt} />
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

      {!loading && tasks.length > 0 && (
        <div className="flex shrink-0 items-center justify-center gap-3 py-1">
          <span className="text-xs text-muted-foreground">
            Showing {tasks.length} of {total} task{total === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <Button type="button" variant="outline" size="sm" onClick={loadMoreTasks} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      )}

      <TaskDetailDialog
        taskId={selectedTask?.id ?? null}
        initialSummary={selectedTask}
        assignableUsers={assignableUsers}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onClose={() => setSelectedTask(null)}
        onChanged={refreshTasks}
        onDeleted={() => {
          setSelectedTask(null);
          refreshTasks();
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} task${selectedIds.size === 1 ? "" : "s"}?`}
        description="This moves the selected task(s) to Trash, where they'll stay recoverable for 30 days before being permanently deleted."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This moves the task to Trash, where it'll stay recoverable for 30 days before being permanently deleted."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) await deleteTask(deleteTarget.id);
        }}
      />
    </div>
  );
}
