"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonBoard } from "@/components/ui/skeleton";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/ui/selection-bar";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TasksListView } from "@/components/tasks/tasks-list-view";
import { useSearch } from "@/components/providers/search-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { useDragAutoScroll } from "@/hooks/use-drag-auto-scroll";
import {
  TASK_STATUSES,
  type AssignableUser,
  type TaskStatus,
  type TaskSummary,
} from "@/components/tasks/types";
import { cn } from "@/lib/utils";

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

export function TasksBoard() {
  const { query } = useSearch();
  const { socket } = useSocket();
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [currentUserName, setCurrentUserName] = useState<string | undefined>(undefined);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [view, setView] = useState<ViewMode>("pipeline");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { containerRef: scrollContainerRef, onDragOver: handleBoardDragOver, stop: stopAutoScroll } =
    useDragAutoScroll<HTMLDivElement>();

  async function loadTasks() {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    if (res.ok) setTasks(data.tasks);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [tasksRes, usersRes, meRes] = await Promise.all([
        fetch("/api/tasks"),
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
    const onTaskChange = () => loadTasks();
    socket.on("task_created", onTaskChange);
    socket.on("task_updated", onTaskChange);
    socket.on("task_deleted", onTaskChange);
    return () => {
      socket.off("task_created", onTaskChange);
      socket.off("task_updated", onTaskChange);
      socket.off("task_deleted", onTaskChange);
    };
  }, [socket]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) =>
      [task.title, task.description].filter(Boolean).some((field) => field!.toLowerCase().includes(q))
    );
  }, [tasks, query]);

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
        />
      )}

      {!loading && view === "pipeline" && (
        <div
          ref={scrollContainerRef}
          className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden pb-4 focus:outline-none"
          onWheel={(e) => {
            if (e.deltaY === 0) return;
            e.currentTarget.scrollLeft += e.deltaY;
          }}
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
                  "flex w-72 shrink-0 flex-col gap-2 rounded-lg p-1.5 transition-colors",
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
                <div className="flex min-h-8 flex-col gap-2">
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
                            <HoverCheckbox
                              checked={selectedIds.has(task.id)}
                              onChange={() => toggleSelected(task.id)}
                              aria-label={`Select ${task.title}`}
                              wrapperClassName="mt-0.5"
                            />
                            <p className="text-sm font-medium">{task.title}</p>
                          </div>
                          <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
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
      )}

      <TaskDetailDialog
        taskId={selectedTask?.id ?? null}
        initialSummary={selectedTask}
        assignableUsers={assignableUsers}
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
    </div>
  );
}
