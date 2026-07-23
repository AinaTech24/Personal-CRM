export type ProjectStatus = "PLANNED" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";

export type ProjectTaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELLED";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  progress: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  department: { id: string; name: string };
  createdBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { members: number; milestones: number; tasks: number };
}

export interface ProjectMemberItem {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
}

export type MilestoneStatus = "PENDING" | "WORKING" | "DONE";

export interface MilestoneItem {
  id: string;
  title: string;
  dueDate: string | null;
  status: MilestoneStatus;
  completedAt: string | null;
}

export const MILESTONE_STATUSES: { value: MilestoneStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "WORKING", label: "Working" },
  { value: "DONE", label: "Done" },
];

export interface ProjectTaskItem {
  id: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  dueDate: string | null;
  progressPct: number;
  milestoneId: string | null;
  parentTaskId: string | null;
  assignedTo: { id: string; name: string } | null;
  /** Who the assignment is attributed to — editable, defaults to the creator. */
  assignedBy: { id: string; name: string } | null;
  /** Who actually raised the task. Not editable; null on tasks predating the field. */
  createdBy: { id: string; name: string } | null;
  dependsOn: { dependsOnTask: { id: string; title: string; status: string } }[];
}

export interface ProjectDocumentItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: string;
  uploadedBy: { name: string };
}

export interface ProjectActivityItem {
  id: string;
  action: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string };
}

/**
 * Someone helping on the project without being on the team — a reviewer, a
 * specialist on loan. Tracked separately from members so headcount and access
 * rules aren't affected by lending someone out.
 */
export interface ProjectSupporterItem {
  id: string;
  role: string | null;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string; surname: string | null; email: string; avatarDataUrl: string | null };
}

export interface ProjectTimeEntryItem {
  id: string;
  workDate: string;
  minutes: number;
  description: string | null;
  createdAt: string;
  user: { id: string; name: string; surname: string | null; avatarDataUrl: string | null };
  createdBy: { id: string; name: string };
}

export interface ProjectDetail extends ProjectSummary {
  estimatedHours: number | null;
  members: ProjectMemberItem[];
  supporters: ProjectSupporterItem[];
  timeEntries: ProjectTimeEntryItem[];
  milestones: MilestoneItem[];
  tasks: ProjectTaskItem[];
  documents: ProjectDocumentItem[];
  activities: ProjectActivityItem[];
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

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "PLANNED", label: "Planned" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const PROJECT_TASK_STATUSES: { value: ProjectTaskStatus; label: string }[] = [
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const PROJECT_STATUS_VARIANT = {
  PLANNED: "secondary",
  ACTIVE: "default",
  ON_HOLD: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
} as const;
