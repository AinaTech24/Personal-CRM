import {
  IconBell,
  IconLeads,
  IconTasks,
  IconProjects,
  IconQuotations,
  IconInvoices,
  IconCalendar,
  IconClock,
  IconMegaphone,
  IconPhone,
  IconFileSpreadsheet,
  IconKey,
  IconCake,
  IconCoffee,
} from "@/components/icons";

export interface NotificationLike {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Message, link and icon for a notification — shared between the bell (which
 * lists them), the toast that fires the moment one arrives, and the full
 * notifications page, so none of the three ever drift into describing the
 * same event differently.
 */
export const NOTIFICATION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  lead_assigned: IconLeads,
  lead_reminder: IconLeads,
  task_assigned: IconTasks,
  task_comment: IconTasks,
  task_attachment_added: IconTasks,
  task_reminder: IconTasks,
  project_assigned: IconProjects,
  project_member_added: IconProjects,
  project_supporter_added: IconProjects,
  project_task_assigned: IconProjects,
  project_document_added: IconProjects,
  quotation_decided: IconQuotations,
  quotation_submitted: IconQuotations,
  meeting_invited: IconCalendar,
  meeting_reminder: IconCalendar,
  check_in_reminder: IconClock,
  check_out_reminder: IconClock,
  lunch_break_reminder: IconCoffee,
  social_client_assigned: IconMegaphone,
  call_assigned: IconPhone,
  leave_requested: IconCalendar,
  leave_decided: IconCalendar,
  form_submitted: IconFileSpreadsheet,
  invoice_overdue: IconInvoices,
  password_rotation_due: IconKey,
  password_entry_shared: IconKey,
  password_entry_revoked: IconKey,
  birthday_gift_due: IconCake,
  birthday_today: IconCake,
};

/** The Settings > Notifications category each type is toggled under — mirrors src/lib/notify.ts's TYPE_TO_CATEGORY, duplicated here because that file imports db.ts and can't be used client-side. Used for the full notifications page's category filter. */
export const NOTIFICATION_CATEGORY: Record<string, string> = {
  lead_assigned: "leads",
  lead_reminder: "leads",
  task_assigned: "tasks",
  task_comment: "tasks",
  task_attachment_added: "tasks",
  task_reminder: "tasks",
  project_assigned: "projects",
  project_member_added: "projects",
  project_supporter_added: "projects",
  project_task_assigned: "projects",
  project_document_added: "projects",
  quotation_decided: "quotations",
  quotation_submitted: "quotations",
  meeting_invited: "meetings",
  meeting_reminder: "meetings",
  check_in_reminder: "attendance",
  check_out_reminder: "attendance",
  lunch_break_reminder: "attendance",
  social_client_assigned: "social",
  call_assigned: "calls",
  leave_requested: "attendance",
  leave_decided: "attendance",
  form_submitted: "forms",
  invoice_overdue: "billing",
  password_rotation_due: "passwords",
  password_entry_shared: "passwords",
  password_entry_revoked: "passwords",
  birthday_gift_due: "birthdays",
  birthday_today: "birthdays",
};

/** Mirrors notify.ts's NOTIFICATION_CATEGORIES labels — duplicated for the same client-safety reason as NOTIFICATION_CATEGORY above. */
export const NOTIFICATION_CATEGORY_LABEL: Record<string, string> = {
  leads: "Leads",
  tasks: "Tasks",
  projects: "Projects",
  meetings: "Meetings",
  quotations: "Quotations",
  attendance: "Attendance",
  social: "Social Media",
  calls: "Calls",
  forms: "Forms",
  billing: "Billing",
  passwords: "Passwords",
  birthdays: "Birthdays",
};

export function notificationMessage(n: NotificationLike): string {
  const actor = typeof n.payload.actorName === "string" && n.payload.actorName ? n.payload.actorName : "Someone";
  switch (n.type) {
    case "lead_assigned": {
      const leadName = typeof n.payload.leadName === "string" ? n.payload.leadName : "a lead";
      return `${actor} assigned you to the lead "${leadName}"`;
    }
    case "lead_reminder": {
      const leadName = typeof n.payload.leadName === "string" ? n.payload.leadName : "a lead";
      return `Reminder: follow up on the lead "${leadName}"`;
    }
    case "task_assigned": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} assigned you to the task "${taskTitle}"`;
    }
    case "task_comment": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} commented on the task "${taskTitle}"`;
    }
    case "task_attachment_added": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      const fileName = typeof n.payload.fileName === "string" ? n.payload.fileName : "a file";
      return `${actor} added "${fileName}" to the task "${taskTitle}"`;
    }
    case "project_assigned": {
      const projectName = typeof n.payload.projectName === "string" ? n.payload.projectName : "a project";
      return `${actor} assigned you the project "${projectName}"`;
    }
    case "project_member_added": {
      const projectName = typeof n.payload.projectName === "string" ? n.payload.projectName : "a project";
      return `${actor} added you to the project "${projectName}"`;
    }
    case "project_supporter_added": {
      const projectName = typeof n.payload.projectName === "string" ? n.payload.projectName : "a project";
      return `${actor} added you as a supporter on "${projectName}"`;
    }
    case "project_task_assigned": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} assigned you to the project task "${taskTitle}"`;
    }
    case "project_document_added": {
      const fileName = typeof n.payload.fileName === "string" ? n.payload.fileName : "a document";
      const projectName = typeof n.payload.projectName === "string" ? n.payload.projectName : "a project";
      return `${actor} added "${fileName}" to "${projectName}"`;
    }
    case "quotation_submitted": {
      const number = typeof n.payload.quotationNumber === "string" ? n.payload.quotationNumber : "a quotation";
      return `${actor} sent quotation ${number} for approval`;
    }
    case "quotation_decided": {
      const number = typeof n.payload.quotationNumber === "string" ? n.payload.quotationNumber : "a quotation";
      const decision = n.payload.decision === "APPROVED" ? "approved" : "rejected";
      return `${actor} ${decision} quotation ${number}`;
    }
    case "meeting_invited": {
      const meetingTitle = typeof n.payload.meetingTitle === "string" ? n.payload.meetingTitle : "a meeting";
      return `${actor} invited you to the meeting "${meetingTitle}"`;
    }
    case "meeting_reminder": {
      const meetingTitle = typeof n.payload.meetingTitle === "string" ? n.payload.meetingTitle : "a meeting";
      return `Reminder: "${meetingTitle}" is coming up`;
    }
    case "task_reminder": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `Reminder: "${taskTitle}" is due for your attention`;
    }
    case "check_in_reminder": {
      const shiftName = typeof n.payload.shiftName === "string" ? n.payload.shiftName : "your shift";
      return `Don't forget to check in for ${shiftName} — the window closes soon`;
    }
    case "check_out_reminder": {
      const shiftName = typeof n.payload.shiftName === "string" ? n.payload.shiftName : "your shift";
      return `Don't forget to check out for ${shiftName} — the window closes soon`;
    }
    case "lunch_break_reminder":
      return "It's almost 1:00 — don't forget to log your lunch break";
    case "social_client_assigned": {
      const clientName = typeof n.payload.clientName === "string" ? n.payload.clientName : "a client";
      return `${actor} assigned you the social media client "${clientName}"`;
    }
    case "call_assigned": {
      const subject = typeof n.payload.callSubject === "string" && n.payload.callSubject ? ` ("${n.payload.callSubject}")` : "";
      return `${actor} logged a call with you as the owner${subject}`;
    }
    case "leave_requested":
      return `${actor} applied for leave`;
    case "leave_decided":
      return `${actor} ${n.payload.decision === "APPROVED" ? "approved" : "rejected"} your leave request`;
    case "form_submitted": {
      return "A form you manage just received a new response";
    }
    case "invoice_overdue": {
      const number = typeof n.payload.invoiceNumber === "string" ? n.payload.invoiceNumber : "An invoice";
      return `${number} is now overdue`;
    }
    case "password_rotation_due": {
      const label = typeof n.payload.label === "string" ? n.payload.label : "A password";
      return `"${label}" hasn't been rotated in a while`;
    }
    case "password_entry_shared": {
      const label = typeof n.payload.label === "string" ? n.payload.label : "a credential";
      return `${actor} shared the credential "${label}" with you`;
    }
    case "password_entry_revoked": {
      const label = typeof n.payload.label === "string" ? n.payload.label : "a credential";
      return `${actor} revoked your access to "${label}"`;
    }
    case "birthday_gift_due": {
      const name = typeof n.payload.name === "string" ? n.payload.name : "Someone's";
      return `${name}'s birthday is coming up — no gift picked yet`;
    }
    case "birthday_today": {
      const name = typeof n.payload.name === "string" ? n.payload.name : "Someone";
      return `🎂 It's ${name}'s birthday today!`;
    }
    default:
      return "You have a new update";
  }
}

export interface NotificationVisual {
  Icon: React.ComponentType<{ className?: string }>;
  /** Background + icon color for the leading icon circle. */
  badgeClassName: string;
  /** Optional left-edge accent on the row/card itself, for the few types that get special treatment. */
  accentClassName?: string;
}

/**
 * Leave and birthday notifications get distinct, meaningful color — blue for
 * a pending leave request, green for approved, red for rejected (matching
 * the status at a glance, not just the type), and a celebratory treatment
 * for a birthday happening today. Everything else keeps the bell's existing
 * neutral icon-only look.
 */
export function notificationVisual(n: NotificationLike): NotificationVisual {
  if (n.type === "birthday_today") {
    return {
      Icon: IconCake,
      badgeClassName: "bg-gradient-to-br from-pink-500/20 to-amber-400/20 text-pink-500 dark:text-pink-400",
      accentClassName: "border-l-2 border-pink-400/70",
    };
  }
  if (n.type === "birthday_gift_due") {
    return { Icon: IconCake, badgeClassName: "bg-pink-500/15 text-pink-500 dark:text-pink-400" };
  }
  if (n.type === "leave_requested") {
    return { Icon: IconCalendar, badgeClassName: "bg-blue-500/15 text-blue-500 dark:text-blue-400", accentClassName: "border-l-2 border-blue-400/70" };
  }
  if (n.type === "leave_decided") {
    const approved = n.payload.decision === "APPROVED";
    return approved
      ? { Icon: IconCalendar, badgeClassName: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400", accentClassName: "border-l-2 border-emerald-400/70" }
      : { Icon: IconCalendar, badgeClassName: "bg-red-500/15 text-red-500 dark:text-red-400", accentClassName: "border-l-2 border-red-400/70" };
  }
  return { Icon: NOTIFICATION_ICON[n.type] ?? IconBell, badgeClassName: "text-muted-foreground" };
}

export function notificationHref(n: NotificationLike): string | null {
  if (n.type === "lead_assigned" || n.type === "lead_reminder") return "/leads";
  if (n.type === "task_assigned" || n.type === "task_comment" || n.type === "task_attachment_added" || n.type === "task_reminder") {
    return "/tasks";
  }
  if (
    n.type === "project_assigned" ||
    n.type === "project_member_added" ||
    n.type === "project_supporter_added" ||
    n.type === "project_task_assigned" ||
    n.type === "project_document_added"
  ) {
    return typeof n.payload.projectId === "string" ? `/projects/${n.payload.projectId}` : "/projects";
  }
  if (n.type === "quotation_decided" || n.type === "quotation_submitted") return "/quotations";
  if (n.type === "meeting_invited" || n.type === "meeting_reminder") return "/meetings";
  if (n.type === "check_in_reminder" || n.type === "check_out_reminder" || n.type === "lunch_break_reminder") return "/attendance";
  if (n.type === "social_client_assigned") {
    return typeof n.payload.clientId === "string" ? `/social-media/${n.payload.clientId}` : "/social-media";
  }
  if (n.type === "call_assigned") return "/calls";
  if (n.type === "leave_requested") return "/admin/leave";
  if (n.type === "leave_decided") return "/leave";
  if (n.type === "form_submitted") {
    return typeof n.payload.formId === "string" ? `/forms/${n.payload.formId}/submissions` : "/forms";
  }
  if (n.type === "invoice_overdue") return "/invoices";
  if (n.type === "password_rotation_due" || n.type === "password_entry_shared" || n.type === "password_entry_revoked") {
    return "/passwords";
  }
  if (n.type === "birthday_gift_due" || n.type === "birthday_today") return "/birthdays";
  return null;
}
