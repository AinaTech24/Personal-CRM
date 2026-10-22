export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELLED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  remindAt: string | null;
  /** The primary (first) assignee — kept for back-compat; prefer `assignees` for the full list. */
  assignedTo: { id: string; name: string } | null;
  /** Everyone this task is assigned to — may be empty, one, or several. */
  assignees?: { id: string; name: string }[];
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  _count: { comments: number; attachments: number };
}

export interface TaskCommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface TaskAttachmentItem {
  /** Set when this attachment is a link rather than an uploaded file. */
  url?: string | null;
  id: string;
  fileName: string;
  filePath: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
}

export interface TaskDetail extends TaskSummary {
  assignedTo: { id: string; name: string; email: string | null } | null;
  assignees?: { id: string; name: string; email: string | null }[];
  comments: TaskCommentItem[];
  attachments: TaskAttachmentItem[];
}

export interface AssignableUser {
  id: string;
  name: string;
  surname?: string | null;
  email: string;
  departmentId: string | null;
  avatarDataUrl?: string | null;
  role?: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER" | null;
}

/** Every assignee of a task, from either shape the API returns — `assignees` when present, falling back to the single legacy `assignedTo`. */
export function taskAssignees(task: Pick<TaskSummary, "assignedTo" | "assignees">): { id: string; name: string }[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees;
  return task.assignedTo ? [task.assignedTo] : [];
}

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];
