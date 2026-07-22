"use client";

import { Badge } from "@/components/ui/badge";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { TASK_STATUSES, type TaskSummary } from "@/components/tasks/types";
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
}: {
  tasks: TaskSummary[];
  onSelect: (task: TaskSummary) => void;
  selectedIds?: Set<string>;
  onToggleSelect: (id: string) => void;
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
                  "group cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/10",
                  selected && "bg-accent/40"
                )}
              >
                <td className="px-4 py-2.5">
                  <HoverCheckbox
                    checked={selected}
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
                  {task.assignedTo ? task.assignedTo.name : "Unassigned"}
                </td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No tasks found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
