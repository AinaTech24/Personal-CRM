import webpush from "web-push";
import { db } from "@/lib/db";

/**
 * Web Push delivery.
 *
 * Push is strictly best-effort: it reaches devices that are closed or
 * backgrounded, while anyone with the app open is already served by the socket.
 * Nothing here is allowed to fail a request that was really about sending a
 * message — every failure is swallowed and logged.
 *
 * Needs a VAPID key pair. Generate one with `npx web-push generate-vapid-keys`
 * and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT. Without them
 * push quietly does nothing, so the app still runs in dev with no config.
 */

const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
// Push services require a contact for the sender; mailto: or an https URL.
const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@ainatech.in";

export const pushConfigured = Boolean(publicKey && privateKey);

if (pushConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function vapidPublicKey() {
  return publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url?: string;
  /** Collapses same-tag notifications so one chat can't flood the shade. */
  tag?: string;
  icon?: string;
}

/**
 * Fan a notification out to every device belonging to these users.
 *
 * Endpoints that the push service reports as gone (404/410) are deleted — they
 * accumulate otherwise, as every reinstall or cleared site data strands one.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!pushConfigured || userIds.length === 0) return;

  const subs = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else console.error("[push] send failed", status, (err as Error).message);
      }
    })
  );

  if (dead.length) {
    await db.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {});
  }
}

// previewText/notificationCopy live in message-preview.ts so the browser can
// use them too — this module can't be bundled client-side.
