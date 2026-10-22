"use client";

import { Badge } from "@/components/ui/badge";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { TASK_STATUSES, taskAssignees, type TaskSummary } from "@/components/tasks/types";
import { cn } from "@/lib/utils";

const PRIORITY_VARIANT = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
} as const;

function statusLabel(status: string) {
  return TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function TasksListView({
  tasks,
  onSelect,
  selectedIds,
  onToggleSelect,
  rowActions,
}: {
  tasks: TaskSummary[];
  onSelect: (task: TaskSummary) => void;
  selectedIds?: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Per-row actions menu; omit to hide the actions column. */
  rowActions?: (task: TaskSummary) => RowAction[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border focus:outline-none">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="w-10 px-4 py-2.5" />
            <th className="px-4 py-2.5 font-medium">Title</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Priority</th>
            <th className="px-4 py-2.5 font-medium">Due date</th>
            <th className="px-4 py-2.5 font-medium">Assigned to</th>
            {rowActions && <th className="w-10 px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const selected = selectedIds?.has(task.id) ?? false;
            return (
              <tr
                key={task.id}
                onClick={() => onSelect(task)}
                className={cn(
                  "group cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5",
                  selected && "bg-accent/40"
                )}
              >
                <td className="w-10 px-4 py-2.5">
                  <HoverCheckbox
                    checked={selected}
                    reveal="fade"
                    onChange={() => onToggleSelect(task.id)}
                    aria-label={`Select ${task.title}`}
                  />
                </td>
                <td className="px-4 py-2.5 font-medium">{task.title}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{statusLabel(task.status)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {taskAssignees(task).length > 0 ? taskAssignees(task).map((a) => a.name).join(", ") : "Unassigned"}
                </td>
                {rowActions && (
                  <td className="px-4 py-2.5">
                    <span className="flex justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <RowActionsMenu actions={rowActions(task)} label={`Actions for ${task.title}`} />
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={rowActions ? 7 : 6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No tasks found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
