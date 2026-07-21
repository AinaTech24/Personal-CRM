"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { notificationCopy } from "@/lib/message-preview";

interface IncomingMessage {
  conversationId: string;
  message: {
    id: string;
    body: string;
    senderId: string;
    sender: { id: string; name: string | null; surname: string | null; avatarDataUrl: string | null };
    attachments: { name: string }[];
  };
  conversation?: { type: string; title: string | null } | null;
}

/**
 * Toasts an incoming chat message anywhere in the app.
 *
 * Mounted in the shell rather than the chat view, so you still find out when
 * you're deep in Leads or Invoices. Clicking it opens the conversation.
 *
 * Suppressed on the Messages page itself: the thread and the conversation list
 * are both already showing it there, and a banner on top would just be noise.
 */
export function MessageToaster({ meId }: { meId: string }) {
  const { socket } = useSocket();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  // Read through refs so the socket handler doesn't need re-binding on every
  // navigation — re-subscribing mid-flight can drop an event.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    const onMessage = (payload: IncomingMessage) => {
      const msg = payload?.message;
      if (!msg) return;
      if (msg.senderId === meId) return;
      if (pathnameRef.current.startsWith("/messages")) return;

      // The same message can arrive twice — once for the user room and once for
      // the conversation room — so only the first sighting gets a toast.
      if (seen.current.has(msg.id)) return;
      seen.current.add(msg.id);
      if (seen.current.size > 200) {
        // Cheap bound; this set lives as long as the tab does.
        seen.current = new Set([msg.id]);
      }

      const senderName = [msg.sender?.name, msg.sender?.surname].filter(Boolean).join(" ") || "Someone";
      const copy = notificationCopy({
        isGroup: payload.conversation?.type === "GROUP",
        groupTitle: payload.conversation?.title,
        senderName,
        body: msg.body ?? "",
        attachmentCount: msg.attachments?.length ?? 0,
        attachmentName: msg.attachments?.[0]?.name,
      });

      toast.toast({
        title: copy.title,
        description: copy.body,
        variant: "info",
        avatarDataUrl: msg.sender?.avatarDataUrl ?? null,
        onClick: () => router.push(`/messages?c=${payload.conversationId}`),
      });
    };

    socket.on("message", onMessage);
    return () => {
      socket.off("message", onMessage);
    };
  }, [socket, meId, toast, router]);

  return null;
}
