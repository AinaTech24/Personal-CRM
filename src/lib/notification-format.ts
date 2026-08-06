import { IconLeads, IconTasks, IconProjects, IconQuotations, IconCalendar, IconClock, IconMegaphone } from "@/components/icons";

export interface NotificationLike {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Message, link and icon for a notification — shared between the bell (which
 * lists them) and the toast that fires the moment one arrives, so the two
 * never drift into describing the same event differently.
 */
export const NOTIFICATION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  lead_assigned: IconLeads,
  task_assigned: IconTasks,
  task_comment: IconTasks,
  project_assigned: IconProjects,
  project_member_added: IconProjects,
  project_supporter_added: IconProjects,
  project_task_assigned: IconProjects,
  quotation_decided: IconQuotations,
  meeting_invited: IconCalendar,
  meeting_reminder: IconCalendar,
  task_reminder: IconTasks,
  check_in_reminder: IconClock,
  check_out_reminder: IconClock,
  social_client_assigned: IconMegaphone,
};

export function notificationMessage(n: NotificationLike): string {
  const actor = typeof n.payload.actorName === "string" && n.payload.actorName ? n.payload.actorName : "Someone";
  switch (n.type) {
    case "lead_assigned": {
      const leadName = typeof n.payload.leadName === "string" ? n.payload.leadName : "a lead";
      return `${actor} assigned you to the lead "${leadName}"`;
    }
    case "task_assigned": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} assigned you to the task "${taskTitle}"`;
    }
    case "task_comment": {
      const taskTitle = typeof n.payload.taskTitle === "string" ? n.payload.taskTitle : "a task";
      return `${actor} commented on the task "${taskTitle}"`;
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
    case "social_client_assigned": {
      const clientName = typeof n.payload.clientName === "string" ? n.payload.clientName : "a client";
      return `${actor} assigned you the social media client "${clientName}"`;
    }
    default:
      return "You have a new update";
  }
}

export function notificationHref(n: NotificationLike): string | null {
  if (n.type === "lead_assigned") return "/leads";
  if (n.type === "task_assigned" || n.type === "task_comment") return "/tasks";
  if (
    n.type === "project_assigned" ||
    n.type === "project_member_added" ||
    n.type === "project_supporter_added" ||
    n.type === "project_task_assigned"
  ) {
    return typeof n.payload.projectId === "string" ? `/projects/${n.payload.projectId}` : "/projects";
  }
  if (n.type === "quotation_decided") return "/quotations";
  if (n.type === "meeting_invited" || n.type === "meeting_reminder") return "/meetings";
  if (n.type === "task_reminder") return "/tasks";
  if (n.type === "check_in_reminder" || n.type === "check_out_reminder") return "/attendance";
  if (n.type === "social_client_assigned") {
    return typeof n.payload.clientId === "string" ? `/social-media/${n.payload.clientId}` : "/social-media";
  }
  return null;
}
