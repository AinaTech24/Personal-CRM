/**
 * One-line summary of a message, for notification banners and toasts.
 *
 * Kept in its own module with no imports: both the server (push payloads) and
 * the browser (in-app toasts) need it, and the push helper drags in web-push
 * and the database, neither of which can be bundled into a client component.
 */
export function previewText(body: string, attachmentCount: number, attachmentName?: string) {
  const text = body.trim();
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text;
  if (attachmentCount > 1) return `${attachmentCount} attachments`;
  return attachmentName ? `📎 ${attachmentName}` : "Sent an attachment";
}

/** How a message should read in a notification: heading plus one line of detail. */
export function notificationCopy(opts: {
  isGroup: boolean;
  groupTitle?: string | null;
  senderName: string;
  body: string;
  attachmentCount: number;
  attachmentName?: string;
}) {
  const preview = previewText(opts.body, opts.attachmentCount, opts.attachmentName);
  // In a group the chat name is the useful heading and the sender goes inline;
  // in a direct chat the sender *is* the conversation.
  return opts.isGroup
    ? { title: opts.groupTitle || "Group chat", body: `${opts.senderName}: ${preview}` }
    : { title: opts.senderName, body: preview };
}
