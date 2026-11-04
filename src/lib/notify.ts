import type { InputJsonObject } from "@/generated/prisma/internal/prismaNamespace";
import { db } from "@/lib/db";
import { emitToUser } from "@/lib/socket-emit";
import { sendPushToUsers, type PushPayload } from "@/lib/push";
import { NOTIFICATION_CATEGORIES, TYPE_TO_CATEGORY, type NotificationCategory } from "@/lib/notification-categories";

// Re-exported so existing call sites (e.g. the notification-preferences
// route) can keep importing these from here — the category data itself now
// lives in notification-categories.ts, the one place notify.ts (server) and
// notification-format.ts (client-safe) both pull it from.
export { NOTIFICATION_CATEGORIES, type NotificationCategory };

/**
 * Creates + broadcasts a notification unless the recipient has turned that
 * category off. A missing preference row means "on" (default-on, matching the
 * app's behavior before per-category preferences existed).
 *
 * Best-effort: a DB hiccup or socket failure here shouldn't turn into a false
 * failure of whatever the caller is actually doing (creating a form, saving a
 * field, submitting an expense) — every call site treats notifying as a side
 * effect of a successful action, not a precondition for one, so this logs and
 * returns null instead of throwing.
 */
export async function notifyUser(userId: string, type: string, payload: InputJsonObject) {
  try {
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
  } catch (err) {
    console.error(`[notify] Failed to notify user ${userId} of ${type}:`, err);
    return null;
  }
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
    try {
      await sendPushToUsers([userId], push);
    } catch (err) {
      console.error(`[notify] Failed to push to user ${userId} of ${type}:`, err);
    }
  }
  return notification;
}
