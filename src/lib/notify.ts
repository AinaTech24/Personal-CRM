import type { InputJsonObject } from "@/generated/prisma/internal/prismaNamespace";
import { db } from "@/lib/db";
import { emitToUser } from "@/lib/socket-emit";

export type NotificationCategory = "leads" | "tasks" | "projects" | "quotations";

/** Maps every concrete notification `type` to the user-facing category it's toggled under. */
const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  lead_assigned: "leads",
  task_assigned: "tasks",
  task_comment: "tasks",
  project_member_added: "projects",
  project_task_assigned: "projects",
  quotation_decided: "quotations",
};

export const NOTIFICATION_CATEGORIES: { value: NotificationCategory; label: string; description: string }[] = [
  { value: "leads", label: "Leads", description: "When a lead is assigned to you" },
  { value: "tasks", label: "Tasks", description: "When a task is assigned to you or gets a new comment" },
  { value: "projects", label: "Projects", description: "When you're added to a project or assigned a project task" },
  { value: "quotations", label: "Quotations", description: "When a quotation you created is approved or rejected" },
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
