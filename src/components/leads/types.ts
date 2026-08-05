export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "MEETING"
  | "QUALIFIED"
  | "PROPOSAL_SENT"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type MeetingStatus = "SCHEDULED" | "DUE" | "COMPLETED";

export interface LeadSummary {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  product: string | null;
  priority: Priority;
  status: LeadStatus;
  leadArriveDate: string | null;
  meetingDate: string | null;
  meetingStatus: MeetingStatus | null;
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  department: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { notes: number; reminders: number };
}

export interface LeadNoteItem {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
}

export interface LeadReminderItem {
  id: string;
  dueAt: string;
  note: string | null;
  completedAt: string | null;
}

export interface LeadActivityItem {
  id: string;
  action: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string };
}

export interface LeadDetail extends LeadSummary {
  assignedTo: { id: string; name: string; email: string | null } | null;
  notes: LeadNoteItem[];
  reminders: LeadReminderItem[];
  activities: LeadActivityItem[];
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

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL_SENT", label: "Proposal Sent" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

/**
 * Social Media's own pipeline for the same shared Leads module — different
 * labels, no Proposal Sent/Negotiation/Lost steps (those don't apply to
 * their onboarding process), plus a Meeting stage the default pipeline
 * doesn't have. Same LeadStatus enum/table underneath; other departments'
 * leads are unaffected and still use LEAD_STATUSES.
 */
export const SOCIAL_MEDIA_LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "Lead Inquiry" },
  { value: "CONTACTED", label: "Calling" },
  { value: "MEETING", label: "Meeting" },
  { value: "QUALIFIED", label: "Plan Discussion" },
  { value: "WON", label: "Approval" },
];

/** Which stage list/labels a viewer should see — Social Media's own pipeline, or the default company one. */
export function getLeadStatusOptions(isSocialMediaOnly: boolean): { value: LeadStatus; label: string }[] {
  return isSocialMediaOnly ? SOCIAL_MEDIA_LEAD_STATUSES : LEAD_STATUSES;
}

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export const MEETING_STATUS_OPTIONS: { value: MeetingStatus; label: string }[] = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "DUE", label: "Due" },
  { value: "COMPLETED", label: "Completed" },
];
