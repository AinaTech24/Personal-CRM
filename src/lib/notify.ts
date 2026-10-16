import type { InputJsonObject } from "@/generated/prisma/internal/prismaNamespace";
import { db } from "@/lib/db";
import { emitToUser } from "@/lib/socket-emit";
import { sendPushToUsers, type PushPayload } from "@/lib/push";

export type NotificationCategory =
  | "leads"
  | "tasks"
  | "projects"
  | "quotations"
  | "meetings"
  | "attendance"
  | "social"
  | "calls"
  | "forms"
  | "billing"
  | "passwords"
  | "birthdays";

/** Maps every concrete notification `type` to the user-facing category it's toggled under. */
const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  lead_assigned: "leads",
  lead_reminder: "leads",
  task_assigned: "tasks",
  task_comment: "tasks",
  project_assigned: "projects",
  project_member_added: "projects",
  project_supporter_added: "projects",
  project_task_assigned: "projects",
  quotation_decided: "quotations",
  meeting_invited: "meetings",
  meeting_reminder: "meetings",
  task_reminder: "tasks",
  check_in_reminder: "attendance",
  check_out_reminder: "attendance",
  social_client_assigned: "social",
  call_assigned: "calls",
  leave_requested: "attendance",
  leave_decided: "attendance",
  form_submitted: "forms",
  invoice_overdue: "billing",
  password_rotation_due: "passwords",
  birthday_gift_due: "birthdays",
};

export const NOTIFICATION_CATEGORIES: { value: NotificationCategory; label: string; description: string }[] = [
  { value: "leads", label: "Leads", description: "When a lead is assigned to you, or someone sends a reminder about one" },
  { value: "tasks", label: "Tasks", description: "When a task is assigned to you, gets a new comment, or a reminder you set on it comes due" },
  { value: "projects", label: "Projects", description: "When you're assigned a project, added as a member or supporter, or assigned a project task" },
  { value: "meetings", label: "Meetings", description: "When you're invited to a meeting, or a reminder you set on one comes due" },
  { value: "quotations", label: "Quotations", description: "When a quotation you created is approved or rejected" },
  { value: "attendance", label: "Attendance", description: "Reminders to check in or check out before your shift window closes" },
  { value: "social", label: "Social Media", description: "When a social media client is assigned to you" },
  { value: "calls", label: "Calls", description: "When a call is logged with you as the owner" },
  { value: "forms", label: "Forms", description: "When a form you created or can view gets a new submission" },
  { value: "billing", label: "Billing", description: "When an invoice you created goes overdue" },
  { value: "passwords", label: "Passwords", description: "When a password entry you own or last updated hasn't been rotated in a while" },
  { value: "birthdays", label: "Birthdays", description: "When someone's birthday is coming up and no gift has been picked yet" },
];

/**
 * Creates + broadcasts a notification unless the recipient has turned that
 * category off. A missing preference row means "on" (default-on, matching the
 * app's behavior before per-category preferences existed).
 */
export async function notifyUser(userId: string, type: string, payload: InputJsonObject) {
  const category = TYPE_TO_CATEGORY[type];
  if (category) {
    const pref = await db.notificationPreference.findUnique({
      where: { userId_category: { userId, category } },
    });
    if (pref && !pref.inApp) return null;
  }

  const notification = await db.notification.create({ data: { userId, type, payload } });
  emitToUser(userId, "notification", notification);
  return notification;
}

/**
 * notifyUser, plus a real OS-level push if it actually created one — so a
 * closed app or backgrounded tab still hears about it, not just an in-app
 * toast/bell. Skipped automatically when notifyUser itself returns null
 * (the recipient has this category turned off in Settings), so muting a
 * category mutes both channels together rather than just the in-app one —
 * the same rule the reminder routes already apply by hand. Those routes
 * build their own push payload inline instead of using this: a reminder
 * fans the exact same content out to several recipients (a meeting's
 * attendees) with nothing per-recipient in it, where every other call site
 * here is a single targeted "you" notification.
 */
export async function notifyAndPush(userId: string, type: string, payload: InputJsonObject, push: PushPayload) {
  const notification = await notifyUser(userId, type, payload);
  if (notification) {
    await sendPushToUsers([userId], push);
  }
  return notification;
}
