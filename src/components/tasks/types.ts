export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELLED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  _count: { comments: number; attachments: number };
}

export interface TaskCommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
}

export interface TaskAttachmentItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: string;
  uploadedBy: { name: string };
}

export interface TaskDetail extends TaskSummary {
  assignedTo: { id: string; name: string; email: string | null } | null;
  comments: TaskCommentItem[];
  attachments: TaskAttachmentItem[];
}

export interface AssignableUser {
  id: string;
  name: string;
  email: string;
  departmentId: string | null;
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
