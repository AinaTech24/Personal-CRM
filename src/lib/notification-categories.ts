/**
 * Which Settings > Notifications category each notification `type` belongs
 * to, and that category's own label/description. Pure data — no `db` import
 * — so both notify.ts (server, gates creation on the user's preference) and
 * notification-format.ts (client-safe, drives the notifications page's
 * category filter) can import this one definition instead of each keeping
 * their own hand-maintained copy of it.
 */

export type NotificationCategory =
  | "leads"
  | "tasks"
  | "projects"
  | "quotations"
  | "meetings"
  | "attendance"
  | "leaves"
  | "social"
  | "calls"
  | "expenses"
  | "forms"
  | "billing"
  | "passwords"
  | "birthdays"
  | "consulting";

/** Maps every concrete notification `type` to the user-facing category it's toggled under. */
export const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  lead_assigned: "leads",
  lead_reminder: "leads",
  task_assigned: "tasks",
  task_comment: "tasks",
  task_attachment_added: "tasks",
  project_assigned: "projects",
  project_member_added: "projects",
  project_supporter_added: "projects",
  project_task_assigned: "projects",
  project_document_added: "projects",
  quotation_decided: "quotations",
  quotation_submitted: "quotations",
  meeting_invited: "meetings",
  meeting_reminder: "meetings",
  task_reminder: "tasks",
  check_in_reminder: "attendance",
  check_out_reminder: "attendance",
  lunch_break_reminder: "attendance",
  social_client_assigned: "social",
  call_assigned: "calls",
  leave_requested: "leaves",
  leave_decided: "leaves",
  expense_requested: "expenses",
  expense_decided: "expenses",
  expense_paid: "expenses",
  form_submitted: "forms",
  form_created: "forms",
  form_edited: "forms",
  invoice_overdue: "billing",
  password_rotation_due: "passwords",
  password_entry_shared: "passwords",
  password_entry_revoked: "passwords",
  birthday_gift_due: "birthdays",
  birthday_today: "birthdays",
  consulting_update: "consulting",
};

export const NOTIFICATION_CATEGORIES: { value: NotificationCategory; label: string; description: string }[] = [
  { value: "leads", label: "Leads", description: "When a lead is assigned to you, or someone sends a reminder about one" },
  {
    value: "tasks",
    label: "Tasks",
    description: "When a task is assigned to you, gets a new comment or attachment, or a reminder you set on it comes due",
  },
  {
    value: "projects",
    label: "Projects",
    description: "When you're assigned a project, added as a member or supporter, assigned a project task, or a document is added",
  },
  { value: "meetings", label: "Meetings", description: "When you're invited to a meeting, or a reminder you set on one comes due" },
  {
    value: "quotations",
    label: "Quotations",
    description: "When a quotation you created is approved or rejected, or one's awaiting your approval",
  },
  { value: "attendance", label: "Attendance", description: "Reminders to check in or check out before your shift window closes" },
  { value: "leaves", label: "Leaves", description: "When someone applies for leave, or your own leave request is approved or rejected" },
  { value: "social", label: "Social Media", description: "When a social media client is assigned to you" },
  { value: "calls", label: "Calls", description: "When a call is logged with you as the owner" },
  {
    value: "expenses",
    label: "Expenses",
    description: "When someone submits a reimbursement claim, or one of yours is approved, rejected, or paid",
  },
  {
    value: "forms",
    label: "Forms",
    description: "When a form you manage gets a new submission, or one is created or edited",
  },
  { value: "billing", label: "Billing", description: "When an invoice you created goes overdue" },
  {
    value: "passwords",
    label: "Passwords",
    description: "When a credential is shared with you, your access to one is revoked, or one you own hasn't been rotated in a while",
  },
  { value: "birthdays", label: "Birthdays", description: "On someone's actual birthday, and when one's coming up with no gift picked yet" },
  {
    value: "consulting",
    label: "Command Centre",
    description: "MFD consulting work drafted for you — tasks, assessments to review, renewals, overdue actions",
  },
];
