"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Popover from "@radix-ui/react-popover";
import { differenceInCalendarDays, format, isToday, isYesterday, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonList, SkeletonThread } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, useDialogState } from "@/components/ui/dialog";
import {
  IconPlus,
  IconSend,
  IconUsers,
  IconChevronLeft,
  IconChevronUp,
  IconChevronDown,
  IconSearch,
  IconSmile,
  IconPaperclip,
  IconX,
  IconTrash,
  IconCheck,
  IconReply,
  IconForward,
  IconPin,
  IconCopy,
  IconSelect,
  IconFile,
  IconImage,
  IconInfo,
  IconMic,
  IconStop,
} from "@/components/icons";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { AnimatedEmoji, TextWithAnimatedEmoji, isEmojiOnly, countEmoji } from "@/components/ui/animated-emoji";
import { NOTO_EMOJI, NOTO_CATEGORIES } from "@/lib/noto-emoji";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { displayUrl, extractUrls, tokenizeLinks } from "@/lib/links";
import { tokenizeMentions } from "@/lib/mentions";
import { MentionChip } from "@/components/chat/mention-chip";
import { RecordingWave } from "@/components/chat/recording-wave";

/* ---------------------------------- types --------------------------------- */

interface ChatUser {
  id: string;
  name: string;
  surname: string | null;
  avatarDataUrl: string | null;
  role?: string;
  email?: string;
  mobile?: string | null;
  department?: { id: string; name: string } | null;
}
interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string;
}
interface ReplyPreview {
  id: string;
  body: string;
  deletedForEveryone: boolean;
  sender: { name: string; surname: string | null };
  attachments: { name: string; mimeType: string }[];
}
interface Message {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: ChatUser;
  attachments: Attachment[];
  reactions: { emoji: string; userId: string }[];
  replyTo: ReplyPreview | null;
  forwardedFromName: string | null;
  /** App-written notice: rendered as a centred capsule, never a bubble. */
  isSystem?: boolean;
  deletedForEveryone: boolean;
  pinnedAt: string | null;
}
interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  isSystem: boolean;
  title: string;
  description: string | null;
  imageDataUrl: string | null;
  members: ChatUser[];
  reads: { userId: string; lastReadAt: string | null }[];
  /** Members who run this group (groups only). */
  groupAdminIds?: string[];
  lastMessage: { body: string; senderName: string; createdAt: string } | null;
  updatedAt: string;
  unread: number;
}
interface PendingAttachment {
  name: string;
  mimeType: string;
  size: number;
  data: string;
}

/* -------------------------------- constants ------------------------------- */

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";
const MAX_BYTES = 10 * 1024 * 1024;
const LONG_BODY = 420;

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");
const initial = (t: string) => (t.trim()[0] ?? "?").toUpperCase();
const fmtTime = (s: string) => format(parseISO(s), "h:mm a");
/** Calendar day a message belongs to, for grouping. */
const dayKey = (s: string) => format(parseISO(s), "yyyy-MM-dd");
/** Heading for a day's run of messages, the way a phone messenger reads. */
const dayLabel = (s: string) => {
  const d = parseISO(s);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  // Inside the last week the weekday is more use than the date.
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEEE");
  return format(d, "d MMMM yyyy");
};
const fmtWhen = (s: string) => (isToday(parseISO(s)) ? fmtTime(s) : format(parseISO(s), "MMM d"));
const isImage = (m: string) => m.startsWith("image/");
const isAudio = (m: string) => m.startsWith("audio/");
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Icon for a file, drawn from the app's icon set (never an OS emoji). */
function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const cls = className ?? "h-4 w-4";
  if (isImage(mime)) return <IconImage className={cls} />;
  return <IconFile className={cls} />;
}

function readFile(file: File): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data: String(reader.result) });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Short synthesized chime — no asset files needed. */
function playSound(kind: "send" | "delete") {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (kind === "send") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1180, ctx.currentTime + 0.12);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.16);
    }
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    setTimeout(() => ctx.close().catch(() => { }), 500);
  } catch {
    /* audio is a nicety — never break sending over it */
  }
}

/* ------------------------------- main view -------------------------------- */

export function ChatView() {
  const { socket } = useSocket();
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState<{ id: string; name: string; isAdmin: boolean }>({ id: "", name: "", isAdmin: false });
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState<{ query: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [ctx, setCtx] = useState<{ message: Message; x: number; y: number } | null>(null);
  const [forwardOf, setForwardOf] = useState<Message | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // The emoji grid mounts on first open and then stays (CSS handles show/hide).
  const [emojiMounted, setEmojiMounted] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [unpinTarget, setUnpinTarget] = useState<Message | null>(null);
  const [deleteChat, setDeleteChat] = useState<Conversation | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [reactPickerFor, setReactPickerFor] = useState<Message | null>(null);
  const [infoUser, setInfoUser] = useState<ChatUser | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  // These dialogs only exist while there's something to show them for, so they
  // need their subject kept alive through the close animation.
  const infoUserDialog = useDialogState(infoUser);
  const previewDialog = useDialogState(preview);
  const forwardDialog = useDialogState(forwardOf);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordStream, setRecordStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = useRef(0);
  const discardRecordingRef = useRef(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingEmit = useRef(0);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json().catch(() => ({ conversations: [] }));
    setConversations(data.conversations ?? []);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/conversations").then((r) => r.json()).catch(() => ({ conversations: [] })),
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({ user: null })),
      fetch("/api/users/assignable?scope=all").then((r) => r.json()).catch(() => ({ users: [] })),
    ]).then(([conv, meRes, u]) => {
      setConversations(conv.conversations ?? []);
      if (meRes.user) setMe({ id: meRes.user.id, name: meRes.user.name, isAdmin: meRes.user.role === "SUPER_ADMIN" || meRes.user.role === "ADMIN" });
      setUsers(u.users ?? []);
      setLoading(false);
    });
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      if (socket) {
        if (activeIdRef.current) socket.emit("leave", `conv:${activeIdRef.current}`);
        socket.emit("join", `conv:${id}`);
      }
      setActiveId(id);
      setTypingNames([]);
      setReplyTo(null);
      setLoadingThread(true);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
      try {
        const res = await fetch(`/api/conversations/${id}/messages`);
        const data = await res.json().catch(() => ({ messages: [] }));
        setMessages(data.messages ?? []);
      } finally {
        setLoadingThread(false);
      }
    },
    [socket]
  );

  // Deep link from a push notification: /messages?c=<conversationId> opens that
  // chat directly, so tapping a banner lands on the message rather than the
  // list. Runs once the conversations are in, and only if the id is really ours.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || loading || conversations.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get("c");

    if (wanted) {
      deepLinked.current = true;
      if (conversations.some((c) => c.id === wanted)) {
        openConversation(wanted);
        // Drop the parameter so a refresh doesn't keep yanking the user back here.
        window.history.replaceState({}, "", "/messages");
      }
      return;
    }

    // No deep link — open Aina Family so the page doesn't start on an empty
    // pane. Only where the list stays visible: below `sm` an open conversation
    // replaces the list, so doing this on a phone would bury every other chat
    // behind a back button on every visit.
    if (activeIdRef.current) return;
    if (!window.matchMedia("(min-width: 640px)").matches) return;
    deepLinked.current = true;
    const home = conversations.find((c) => c.isSystem) ?? conversations[0];
    if (home) openConversation(home.id);
  }, [loading, conversations, openConversation]);

  // Smooth auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typingNames]);

  const upsertMessage = useCallback((m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
  }, []);

  /* presence */
  useEffect(() => {
    if (!socket) return;
    const onInit = (ids: string[]) => setOnlineIds(new Set(ids));
    const onPresence = ({ userId, online }: { userId: string; online: boolean }) =>
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    socket.on("presence:init", onInit);
    socket.on("presence", onPresence);
    return () => {
      socket.off("presence:init", onInit);
      socket.off("presence", onPresence);
    };
  }, [socket]);

  /* messages, edits, typing, read receipts */
  useEffect(() => {
    if (!socket) return;
    const onMessage = ({ conversationId, message }: { conversationId: string; message: Message }) => {
      if (conversationId === activeIdRef.current) {
        upsertMessage(message);
        setTypingNames((prev) => prev.filter((n) => n !== message.sender.name));
      }
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) {
          loadConversations();
          return prev;
        }
        const conv = prev[idx];
        const isActive = conversationId === activeIdRef.current;
        const updated: Conversation = {
          ...conv,
          lastMessage: { body: message.body || "📎 Attachment", senderName: message.sender.name, createdAt: message.createdAt },
          updatedAt: message.createdAt,
          unread: isActive || message.senderId === me.id ? 0 : conv.unread + 1,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)].sort((a, b) => Number(b.isSystem) - Number(a.isSystem));
      });
    };
    const onUpdate = ({ conversationId, message }: { conversationId: string; message: Message }) => {
      if (conversationId === activeIdRef.current) upsertMessage(message);
    };
    const onHidden = ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      if (conversationId === activeIdRef.current) setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };
    const onRead = ({ conversationId, userId, at }: { conversationId: string; userId: string; at: string }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, reads: c.reads.map((r) => (r.userId === userId ? { ...r, lastReadAt: at } : r)) } : c
        )
      );
    };
    const onTyping = (d: { conversationId: string; userId: string; name: string }) => {
      if (d.conversationId !== activeIdRef.current || d.userId === me.id) return;
      setTypingNames((prev) => (prev.includes(d.name) ? prev : [...prev, d.name]));
      const timers = typingTimers.current;
      clearTimeout(timers.get(d.userId));
      timers.set(
        d.userId,
        setTimeout(() => setTypingNames((prev) => prev.filter((n) => n !== d.name)), 3500)
      );
    };
    const onStopTyping = (d: { conversationId: string; name: string }) => {
      if (d.conversationId !== activeIdRef.current) return;
      setTypingNames((prev) => prev.filter((n) => n !== d.name));
    };
    socket.on("message", onMessage);
    socket.on("message:update", onUpdate);
    socket.on("message:hidden", onHidden);
    socket.on("read", onRead);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);
    // Someone else deleted a chat we're in — drop it everywhere.
    const onConversationDeleted = ({ conversationId }: { conversationId: string }) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeIdRef.current === conversationId) {
        setActiveId(null);
        setMessages([]);
      }
    };
    socket.on("conversation", loadConversations);
    socket.on("conversation:deleted", onConversationDeleted);
    return () => {
      socket.off("message", onMessage);
      socket.off("message:update", onUpdate);
      socket.off("message:hidden", onHidden);
      socket.off("read", onRead);
      socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping);
      socket.off("conversation", loadConversations);
      socket.off("conversation:deleted", onConversationDeleted);
    };
  }, [socket, upsertMessage, loadConversations, me.id]);

  /* Place the context menu once it's measured, flipping it up and/or left so it
     always stays fully on screen regardless of where the click landed. */
  useLayoutEffect(() => {
    if (!ctx) {
      setMenuPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer down-right; flip when it would overflow, then clamp to the viewport.
    let left = ctx.x + width + pad > vw ? ctx.x - width : ctx.x;
    let top = ctx.y + height + pad > vh ? ctx.y - height : ctx.y;
    left = Math.max(pad, Math.min(left, vw - width - pad));
    top = Math.max(pad, Math.min(top, vh - height - pad));
    setMenuPos({ left, top });
  }, [ctx]);

  /* close the emoji panel on an outside click — AnimatePresence plays the same
     animation in reverse, so it closes exactly the way it opened */
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (emojiPanelRef.current?.contains(t as Node)) return;
      if (t?.closest?.("[data-emoji-toggle]")) return;
      setEmojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEmojiOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  /* close context menu on outside click / Escape */
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  // Messages interleaved with a heading whenever the calendar day changes, so
  // yesterday's and today's don't run together with only a clock to tell them
  // apart. Flattened rather than wrapped in fragments: AnimatePresence tracks
  // its direct children, and a fragment would hide the bubbles from it.
  const threadItems = useMemo(() => {
    const items: (
      | { kind: "day"; key: string; label: string; firstMessageId: string }
      | { kind: "message"; key: string; message: Message }
    )[] = [];
    let lastDay: string | null = null;
    for (const m of messages) {
      const day = dayKey(m.createdAt);
      if (day !== lastDay) {
        // Carries the day's first message so the heading can jump back to it.
        items.push({ kind: "day", key: `day-${day}`, label: dayLabel(m.createdAt), firstMessageId: m.id });
        lastDay = day;
      }
      items.push({ kind: "message", key: m.id, message: m });
    }
    return items;
  }, [messages]);
  const otherMember = active && active.type === "DIRECT" ? active.members.find((m) => m.id !== me.id) ?? null : null;
  const otherOnline = otherMember ? onlineIds.has(otherMember.id) : false;
  const pinned = useMemo(() => messages.filter((m) => m.pinnedAt && !m.deletedForEveryone), [messages]);

  /** sent → delivered → seen, from the other members' last-read times + presence. */
  const statusOf = useCallback(
    (m: Message): "sent" | "delivered" | "seen" => {
      if (!active || m.senderId !== me.id) return "sent";
      const others = active.reads.filter((r) => r.userId !== me.id);
      if (others.some((r) => r.lastReadAt && new Date(r.lastReadAt) >= new Date(m.createdAt))) return "seen";
      const anyOnline = active.members.some((u) => u.id !== me.id && onlineIds.has(u.id));
      return anyOnline ? "delivered" : "sent";
    },
    [active, me.id, onlineIds]
  );

  function emitTyping() {
    if (!socket || !activeId) return;
    const now = Date.now();
    if (now - lastTypingEmit.current > 1500) {
      socket.emit("typing", { conversationId: activeId, userId: me.id, name: me.name });
      lastTypingEmit.current = now;
    }
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => socket.emit("stop_typing", { conversationId: activeId, userId: me.id }), 2500);
  }

  // Grows the composer with its content — reset to "auto" first so deleting
  // text (or sending, which clears the draft) shrinks it back down instead
  // of only ever growing, then re-measure against the actual content height.
  // Capped by the textarea's own max-h class; overflow-y-auto on it takes
  // over with a normal scrollbar past that point.
  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  function onDraftChange(value: string) {
    setDraft(value);
    emitTyping();
    const m = value.match(/(?:^|\s)@([\w.]*)$/);
    setMention(m ? { query: m[1] } : null);
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("video/")) {
        toast.error("Videos aren't allowed", file.name);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error("File too large (max 10MB)", file.name);
        continue;
      }
      picked.push(await readFile(file));
    }
    setPending((prev) => [...prev, ...picked].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }

  /**
   * Voice notes. Recording stops either way; `keep` decides whether the audio
   * becomes a pending attachment or is dropped and never leaves the browser.
   */
  function stopRecording(keep: boolean) {
    const rec = recorderRef.current;
    if (!rec) return;
    discardRecordingRef.current = !keep;
    rec.stop();
  }

  async function startRecording() {
    if (recording) return;

    // getUserMedia only exists in a secure context, so an http:// page shows the
    // same "unsupported" symptom as a genuinely old browser. Separate the two.
    if (!window.isSecureContext) {
      return toast.error("Microphone needs a secure connection", "Open the CRM over https:// (or localhost) to record.");
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return toast.error("Recording isn't supported in this browser");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorderRef.current = rec;
      // Held so the waveform can analyse the same live stream; cleared on stop
      // to release the microphone.
      setRecordStream(stream);

      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordStream(null);
        if (recordTimer.current) clearInterval(recordTimer.current);
        const seconds = recordSecsRef.current;
        setRecording(false);
        setRecordSecs(0);
        recorderRef.current = null;
        // Discarded: the blob is simply never read, so nothing is stored or sent.
        if (discardRecordingRef.current) return;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        const data = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
        setPending((prev) => [
          ...prev,
          { name: `voice-note-${mmss(seconds).replace(":", "m")}s.webm`, mimeType: blob.type, size: blob.size, data },
        ]);
      };

      rec.start();
      discardRecordingRef.current = false;
      setRecording(true);
      setRecordSecs(0);
      recordSecsRef.current = 0;
      recordTimer.current = setInterval(() => {
        recordSecsRef.current += 1;
        setRecordSecs(recordSecsRef.current);
        // Hard cap so a forgotten recording can't grow unbounded.
        if (recordSecsRef.current >= 300) stopRecording(true);
      }, 1000);
    } catch (err) {
      // Each failure needs a different fix, so name the actual one.
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        toast.error(
          "Microphone blocked",
          "Allow it for this site in your browser, and check the OS privacy settings let your browser use the mic."
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        toast.error("No microphone found", "Connect a mic or check it isn't disabled in your system settings.");
      } else if (name === "NotReadableError") {
        toast.error("Microphone is in use", "Another app has the mic open — close it and try again.");
      } else if (name === "SecurityError") {
        toast.error("Microphone blocked by policy", "A Permissions-Policy header is disabling the mic for this site.");
      } else {
        toast.error("Couldn't start recording", name || "Unknown error");
      }
    }
  }

  async function send() {
    const text = draft.trim();
    if ((!text && pending.length === 0) || !activeId || sending) return;
    setSending(true);
    setDraft("");
    const attachments = pending;
    const parent = replyTo;
    setPending([]);
    setReplyTo(null);
    if (socket) socket.emit("stop_typing", { conversationId: activeId, userId: me.id });
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, attachments, replyToId: parent?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't send", data.error);
        setDraft(text);
        setPending(attachments);
        setReplyTo(parent);
        return;
      }
      upsertMessage(data.message);
      playSound("send");
    } finally {
      setSending(false);
    }
  }

  async function react(message: Message, emoji: string) {
    setCtx(null);
    const res = await fetch(`/api/messages/${message.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.message) upsertMessage(data.message);
  }

  /** Unpinning is confirmed first — it's a shared, visible change for everyone. */
  function requestPinToggle(message: Message) {
    setCtx(null);
    if (message.pinnedAt) setUnpinTarget(message);
    else togglePin(message);
  }

  async function deleteConversation(conversation: Conversation) {
    const res = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return toast.error("Couldn't delete the chat", d.error);
    }
    playSound("delete");
    toast.success("Chat deleted");
    if (activeIdRef.current === conversation.id) {
      setActiveId(null);
      setMessages([]);
    }
    setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
  }

  async function togglePin(message: Message) {
    setCtx(null);
    const res = await fetch(`/api/messages/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !message.pinnedAt }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.message) upsertMessage(data.message);
    else toast.error("Couldn't pin the message");
  }

  async function remove(message: Message, scope: "me" | "everyone") {
    setCtx(null);
    const res = await fetch(`/api/messages/${message.id}?scope=${scope}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return toast.error("Couldn't delete", d.error);
    }
    playSound("delete");
    if (scope === "me") setMessages((prev) => prev.filter((m) => m.id !== message.id));
    else {
      const d = await res.json().catch(() => null);
      if (d?.message) upsertMessage(d.message);
    }
  }

  /** Copy one or more messages to the clipboard (sender + text, newest last). */
  async function copyMessages(list: Message[]) {
    setCtx(null);
    const text = list
      .filter((m) => !m.deletedForEveryone)
      .map((m) => (list.length > 1 ? `${fullName(m.sender)}: ${m.body || "[attachment]"}` : m.body || "[attachment]"))
      .join("\n");
    if (!text) return toast.error("Nothing to copy");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(list.length > 1 ? `Copied ${list.length} messages` : "Copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedMessages = useMemo(() => messages.filter((m) => selectedIds.has(m.id)), [messages, selectedIds]);

  /** Delete every selected message for me (bulk). */
  async function deleteSelected() {
    const list = [...selectedIds];
    exitSelect();
    await Promise.all(list.map((id) => fetch(`/api/messages/${id}?scope=me`, { method: "DELETE" })));
    setMessages((prev) => prev.filter((m) => !list.includes(m.id)));
    playSound("delete");
  }

  const mentionMatches = useMemo(() => {
    if (!mention || !active) return [];
    const q = mention.query.toLowerCase();
    return active.members.filter((m) => m.id !== me.id && fullName(m).toLowerCase().includes(q)).slice(0, 6);
  }, [mention, active, me.id]);

  function scrollToMessage(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /**
   * Messages matching the search, oldest first.
   *
   * Matched on the body text only — attachments and reply quotes aren't the
   * thing being searched, and a deleted message has no text to find.
   */
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.filter((m) => !m.deletedForEveryone && m.body.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, searchQuery]);

  // Jump to whichever result is current. Clamped rather than wrapped by the
  // caller so the index can never point past the list after a re-search.
  useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) return;
    const id = searchMatches[Math.min(searchIndex, searchMatches.length - 1)];
    if (id) scrollToMessage(id);
  }, [searchOpen, searchMatches, searchIndex]);

  // A new query starts from the newest match, which is what you're looking at.
  useEffect(() => {
    setSearchIndex(Math.max(0, searchMatches.length - 1));
  }, [searchMatches.length]);

  function stepSearch(delta: number) {
    if (searchMatches.length === 0) return;
    setSearchIndex((prev) => {
      const next = prev + delta;
      // Wrap, so stepping past either end continues rather than dead-ending.
      return (next + searchMatches.length) % searchMatches.length;
    });
  }

  const activeMatchId = searchMatches[Math.min(searchIndex, Math.max(0, searchMatches.length - 1))] ?? null;

  return (
    // h-full, not a viewport calc: subtracting a hardcoded 7rem for the topbar
    // and padding was 24px off, leaving dead space under the panel, and it went
    // further out whenever the topbar grew by the status-bar inset.
    <div className="flex h-full overflow-hidden rounded-xl border border-border bg-card/30">
      {/* Conversation list */}
      <div className={cn("flex w-full flex-col border-r border-border sm:w-72 lg:w-80", activeId && "hidden sm:flex")}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-semibold">Messages</h1>
            <HelpDialog title="Messages — help">
              <HelpSection heading="What this page is for">
                <p>Direct and group conversations with anyone else at the company — text, file attachments, reactions, replies, and forwarding.</p>
              </HelpSection>
              <HelpSection heading="Who can see a conversation">
                <p>Only its members. There&apos;s no department scoping here — membership is what controls access, same for everyone including Admins.</p>
              </HelpSection>
            </HelpDialog>
          </div>
          <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
            <IconPlus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <SkeletonList rows={6} />
          ) : (
          conversations.map((c) => {
            const other = c.type === "DIRECT" ? c.members.find((m) => m.id !== me.id) : null;
            return (
              <div
                key={c.id}
                // Suppress the browser menu here and offer our own delete instead.
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!c.isSystem) setDeleteChat(c);
                }}
                className={cn(
                  "group/chat relative border-b border-border/50 transition-colors hover:bg-primary/5",
                  activeId === c.id && "bg-accent/60"
                )}
              >
                <button
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <Avatar title={c.title} group={c.type === "GROUP"} image={c.imageDataUrl} online={other ? onlineIds.has(other.id) : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.title}</span>
                      {c.lastMessage && <span className="shrink-0 text-[11px] text-muted-foreground">{fmtWhen(c.lastMessage.createdAt)}</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastMessage ? `${c.type === "GROUP" ? `${c.lastMessage.senderName}: ` : ""}${c.lastMessage.body}` : "No messages yet"}
                    </p>
                  </div>
                  {c.unread > 0 && <motion.span layout className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                </button>

                {/* Appears on hover, bottom-right of the row. The reveal lives on
                    the tooltip's wrapper because that is the positioned element
                    now — the button inside it is static. */}
                {!c.isSystem && (
                  <Tooltip
                    label="Delete chat permanently"
                    side="left"
                    wrapperClassName="absolute bottom-1.5 right-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/chat:opacity-100"
                  >
                    <button
                      type="button"
                      aria-label={`Delete chat with ${c.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteChat(c);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          }))}
        </div>
      </div>

      {/* Thread */}
      <div className={cn("flex min-w-0 flex-1 flex-col", !activeId && "hidden sm:flex")}>
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a conversation</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button type="button" onClick={() => setActiveId(null)} className="sm:hidden" aria-label="Back">
                <IconChevronLeft className="h-5 w-5" />
              </button>
              <Avatar
                title={active.title}
                group={active.type === "GROUP"}
                image={active.imageDataUrl}
                online={otherMember ? otherOnline : undefined}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{active.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {active.type === "GROUP" ? `${active.members.length} members` : otherOnline ? <span className="text-emerald-500">Active now</span> : "Offline"}
                </p>
              </div>

              <IconButton
                label="Search in chat"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  if (searchOpen) setSearchQuery("");
                }}
              >
                <IconSearch className="h-4.5 w-4.5" />
              </IconButton>

              {/* Quick info: contact card for a direct chat, group info for a group. */}
              <IconButton
                label="Info"
                onClick={() => {
                  if (active.type === "GROUP") setGroupInfoOpen(true);
                  else if (otherMember) setInfoUser(otherMember);
                }}
              >
                <IconInfo className="h-4.5 w-4.5" />
              </IconButton>

            </div>

            {/* Search bar — appears under the header while searching. */}
            {searchOpen && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                <IconSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in this chat…"
                  onKeyDown={(e) => {
                    // Enter walks results the way a browser's find does.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      stepSearch(e.shiftKey ? -1 : 1);
                    } else if (e.key === "Escape") {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {searchQuery.trim() && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {searchMatches.length === 0 ? "No results" : `${searchIndex + 1} of ${searchMatches.length}`}
                  </span>
                )}
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label="Previous result"
                    disabled={searchMatches.length === 0}
                    onClick={() => stepSearch(-1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground disabled:opacity-40"
                  >
                    <IconChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next result"
                    disabled={searchMatches.length === 0}
                    onClick={() => stepSearch(1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground disabled:opacity-40"
                  >
                    <IconChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Close search"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Pinned bar */}
            <AnimatePresence initial={false}>
              {pinned.length > 0 && (
                <motion.button
                  type="button"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onClick={() => scrollToMessage(pinned[pinned.length - 1].id)}
                  // Right-click the pinned bar to unpin (asks first).
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setUnpinTarget(pinned[pinned.length - 1]);
                  }}
                  className="flex w-full items-center gap-2 overflow-hidden border-b border-border bg-amber-500/10 px-4 py-2 text-left text-xs"
                >
                  <IconPin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">
                      {pinned[pinned.length - 1].body || pinned[pinned.length - 1].attachments[0]?.name || "Attachment"}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      Pinned by {fullName(pinned[pinned.length - 1].sender)}
                      {pinned.length > 1 ? ` · ${pinned.length} pinned` : ""}
                    </span>
                  </span>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Marked so a mention's hover card can keep itself inside the
                thread rather than spilling over the sidebar or the page. */}
            <div ref={scrollRef} data-chat-thread className="flex-1 space-y-1 overflow-y-auto p-4">
              {loadingThread ? (
                <SkeletonThread rows={6} />
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hello 👋</p>
              ) : (
                <AnimatePresence initial={false}>
                  {threadItems.map((item) =>
                    item.kind === "day" ? (
                      // Pinned to the top of the thread while that day's
                      // messages scroll past, so you always know what you're
                      // looking at. Clicking it returns to the day's first
                      // message.
                      <div key={item.key} className="sticky top-0 z-10 flex items-center justify-center py-2">
                        <button
                          type="button"
                          onClick={() => scrollToMessage(item.firstMessageId)}
                          className="rounded-full bg-muted/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-primary/5 hover:text-foreground"
                        >
                          {item.label}
                        </button>
                      </div>
                    ) : item.message.isSystem ? (
                      // Same capsule as a day heading so the two read as one
                      // kind of thing — thread furniture, not conversation.
                      <div key={item.key} className="flex justify-center py-1.5">
                        <span className="max-w-[80%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
                          {item.message.body}
                        </span>
                      </div>
                    ) : (
                      ((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      members={users}
                      highlight={searchOpen ? searchQuery.trim() : ""}
                      isActiveMatch={item.message.id === activeMatchId}
                      mine={m.senderId === me.id}
                      group={active.type === "GROUP"}
                      status={statusOf(m)}
                      expanded={expanded.has(m.id)}
                      onToggleExpand={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      onContext={(x, y) => setCtx({ message: m, x, y })}
                      onOpenAttachment={setPreview}
                      onQuoteClick={scrollToMessage}
                      onReact={react}
                      meId={me.id}
                      selectMode={selectMode}
                      selected={selectedIds.has(m.id)}
                      onSelectToggle={() => toggleSelected(m.id)}
                      onSenderClick={() => setInfoUser(active.members.find((u) => u.id === m.senderId) ?? m.sender)}
                    />
                      ))(item.message)
                    )
                  )}
                </AnimatePresence>
              )}
              <AnimatePresence>
                {typingNames.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 px-1 py-1">
                    <span className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
                          animate={{ y: [0, -3, 0] }}
                          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </span>
                    <span className="text-xs italic text-muted-foreground">
                      {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Reply preview */}
            <AnimatePresence>
              {replyTo && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex items-center gap-2 overflow-hidden border-t border-border bg-muted/40 px-4 py-2"
                >
                  <div className="h-8 w-1 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-primary">Replying to {fullName(replyTo.sender)}</p>
                    <p className="truncate text-xs text-muted-foreground">{replyTo.body || "Attachment"}</p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                    <IconX className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pending attachments with caption hint */}
            <AnimatePresence>
              {pending.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-border px-3 pt-2"
                >
                  <p className="mb-1.5 text-[11px] text-muted-foreground">
                    {pending.length} file{pending.length === 1 ? "" : "s"} ready — add a description below, then send.
                  </p>
                  <div className="flex flex-wrap gap-2 pb-1">
                    {pending.map((a, i) => (
                      <motion.div
                        key={`${a.name}-${i}`}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs"
                      >
                        {isImage(a.mimeType) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.data} alt={a.name} className="h-9 w-9 rounded object-cover" />
                        ) : isAudio(a.mimeType) ? (
                          <IconMic className="h-5 w-5 text-primary" />
                        ) : (
                          <FileIcon mime={a.mimeType} className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className="min-w-0">
                          <span className="block max-w-32 truncate">{a.name}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtSize(a.size)}</span>
                        </span>
                        <button type="button" onClick={() => setPending((prev) => prev.filter((_, x) => x !== i))} aria-label="Remove">
                          <IconX className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Selection toolbar */}
            <AnimatePresence>
              {selectMode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex items-center gap-2 overflow-hidden border-t border-border bg-accent/40 px-3 py-2"
                >
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton label="Copy selected" onClick={() => copyMessages(selectedMessages)}>
                      <IconCopy className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Forward selected"
                      onClick={() => {
                        const first = selectedMessages[0];
                        if (first) setForwardOf(first);
                      }}
                    >
                      <IconForward className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Delete selected" onClick={() => setBulkDeleteConfirm(true)}>
                      <IconTrash className="h-4 w-4 text-destructive" />
                    </IconButton>
                    <IconButton label="Cancel selection" onClick={exitSelect}>
                      <IconX className="h-4 w-4" />
                    </IconButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Composer */}
            <div className="relative flex items-end gap-1.5 border-t border-border p-3 pb-[calc(0.75rem+var(--safe-bottom,0px))]">
              <AnimatePresence>
                {mention && mentionMatches.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.97 }}
                    // z-30: the day headings are sticky at z-10, and without this they
                    // render over the list and eat the clicks on any name behind them.
                    className="absolute bottom-full left-3 z-30 mb-1 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
                  >
                    {mentionMatches.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setDraft((prev) => prev.replace(/(^|\s)@([\w.]*)$/, `$1@${fullName(u)} `));
                          setMention(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/5"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {initial(fullName(u))}
                        </span>
                        {fullName(u)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mounted once opened, then kept and animated purely with CSS so the
                  open and close animations are the exact same curve reversed — and
                  a closed panel can never linger as an invisible click-blocker. */}
              {emojiMounted && (
                <div
                  ref={emojiPanelRef}
                  aria-hidden={!emojiOpen}
                  // Inline styles (not utility classes) so the open/close curve is
                  // identical and can't be dropped by CSS tree-shaking.
                  style={{
                    opacity: emojiOpen ? 1 : 0,
                    transform: emojiOpen ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
                    pointerEvents: emojiOpen ? "auto" : "none",
                    transition: "opacity 200ms cubic-bezier(0.16,1,0.3,1), transform 200ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                  className="absolute bottom-full left-3 mb-1 w-72 origin-bottom-left overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
                >
                  <EmojiGrid
                    active={emojiOpen}
                    onPick={(char) => {
                      setDraft((prev) => prev + char);
                      setEmojiOpen(false);
                    }}
                  />
                </div>
              )}

              {/* While recording, the composer becomes the recorder. */}
              {recording ? (
                <div
                  // min-w-0: without it this flex box can't shrink below its
                  // content, and the waveform inside would push the recorder
                  // wider than the screen on a phone.
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5"
                >
                  <motion.span
                    className="h-2.5 w-2.5 rounded-full bg-destructive"
                    animate={{ opacity: [1, 0.25, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  {/* The wave takes the slack so the timer and controls stay put
                      as the duration grows. */}
                  <RecordingWave stream={recordStream} className="min-w-0 flex-1 text-destructive/70" />
                  <span className="shrink-0 text-sm tabular-nums">{mmss(recordSecs)}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <IconButton label="Delete recording" onClick={() => stopRecording(false)}>
                      <IconTrash className="h-4 w-4 text-destructive" />
                    </IconButton>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => stopRecording(true)}
                      aria-label="Stop recording"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
                    >
                      <IconStop className="h-4 w-4" />
                    </motion.button>
                  </div>
                </div>
              ) : null}

              <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
              {!recording && (
                <IconButton label="Attach" onClick={() => fileRef.current?.click()}>
                  <IconPaperclip className="h-4.5 w-4.5" />
                </IconButton>
              )}
              {!recording && (
                <IconButton label="Record voice note" onClick={startRecording}>
                  <IconMic className="h-4.5 w-4.5" />
                </IconButton>
              )}
              {!recording && (
                <span data-emoji-toggle>
                  <IconButton
                    label="Emoji"
                    onClick={() => {
                      setEmojiMounted(true);
                      setEmojiOpen((v) => !v);
                    }}
                  >
                    <IconSmile className="h-4.5 w-4.5" />
                  </IconButton>
                </span>
              )}
              {!recording && (
                <textarea
                  ref={draftRef}
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter (or Ctrl/Cmd+Enter) inserts a
                    // newline like every other chat app — left to the
                    // textarea's own default handling, not intercepted here.
                    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={pending.length ? "Add a description…" : "Type a message… use @ to mention"}
                  rows={1}
                  className="flex max-h-32 min-h-9 w-full resize-none overflow-y-auto rounded-md border border-input bg-transparent px-3 py-1.5 text-sm leading-snug transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              )}
              {!recording && (
                <Tooltip label="Send" side="top" wrapperClassName="shrink-0">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.88, rotate: -12 }}
                    transition={{ type: "spring", stiffness: 600, damping: 20 }}
                    onClick={send}
                    disabled={sending || (!draft.trim() && pending.length === 0)}
                    aria-label="Send"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
                  >
                    <IconSend className="h-4 w-4" />
                  </motion.button>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right-click menu */}
      <AnimatePresence>
        {ctx && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.12 }}
            // Measured and flipped so the menu never runs off any edge.
            style={{ left: menuPos?.left ?? ctx.x, top: menuPos?.top ?? ctx.y, visibility: menuPos ? "visible" : "hidden" }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-2xl"
          >
            {!ctx.message.deletedForEveryone && (
              <div className="flex items-center justify-around border-b border-border px-1 pb-1.5 pt-1">
                {QUICK_REACTIONS.map((e) => (
                  <motion.button
                    key={e}
                    type="button"
                    whileHover={{ scale: 1.3 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => react(ctx.message, e)}
                    className="flex items-center justify-center rounded p-0.5"
                  >
                    <AnimatedEmoji emoji={e} sizePx={24} playOnHover />
                  </motion.button>
                ))}
                <motion.button
                  type="button"
                  aria-label="More reactions"
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setReactPickerFor(ctx.message);
                    setCtx(null);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                </motion.button>
              </div>
            )}
            {!ctx.message.deletedForEveryone && (
              <>
                <MenuItem onClick={() => { setReplyTo(ctx.message); setCtx(null); }}>
                  <IconReply className="h-4 w-4" /> Reply
                </MenuItem>
                <MenuItem onClick={() => { setForwardOf(ctx.message); setCtx(null); }}>
                  <IconForward className="h-4 w-4" /> Forward
                </MenuItem>
                <MenuItem onClick={() => copyMessages([ctx.message])}>
                  <IconCopy className="h-4 w-4" /> Copy
                </MenuItem>
                <MenuItem onClick={() => { setSelectMode(true); setSelectedIds(new Set([ctx.message.id])); setCtx(null); }}>
                  <IconSelect className="h-4 w-4" /> Select
                </MenuItem>
                <MenuItem onClick={() => requestPinToggle(ctx.message)}>
                  <IconPin className="h-4 w-4" /> {ctx.message.pinnedAt ? "Unpin" : "Pin"}
                </MenuItem>
              </>
            )}
            <MenuItem
              onClick={() => {
                setInfoUser(active?.members.find((u) => u.id === ctx.message.senderId) ?? ctx.message.sender);
                setCtx(null);
              }}
            >
              <IconUsers className="h-4 w-4" /> Info
            </MenuItem>
            <MenuItem onClick={() => remove(ctx.message, "me")} danger>
              <IconTrash className="h-4 w-4" /> Delete for me
            </MenuItem>
            {ctx.message.senderId === me.id && !ctx.message.deletedForEveryone && (
              <MenuItem onClick={() => remove(ctx.message, "everyone")} danger>
                <IconTrash className="h-4 w-4" /> Delete for everyone
              </MenuItem>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stays mounted while open so Radix can play the close animation; React
          would otherwise unmount it the instant the flag flips. */}
      {active && (
        <GroupInfoDialog
          open={groupInfoOpen}
          conversation={active}
          // A group's own admins manage it; CRM admins can manage any group.
          canEdit={me.isAdmin || (active.groupAdminIds ?? []).includes(me.id)}
          onClose={() => setGroupInfoOpen(false)}
          onSaved={() => {
            setGroupInfoOpen(false);
            loadConversations();
          }}
        />
      )}

      <Dialog open={!!reactPickerFor} onOpenChange={(v) => !v && setReactPickerFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick a reaction</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <EmojiGrid
              active={!!reactPickerFor}
              onPick={(char) => {
                const target = reactPickerFor;
                setReactPickerFor(null);
                if (target) react(target, char);
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!unpinTarget}
        onOpenChange={(v) => !v && setUnpinTarget(null)}
        title="Unpin this message?"
        description="It will no longer show in the pinned bar for anyone in this chat."
        confirmLabel="Unpin"
        onConfirm={async () => {
          const target = unpinTarget;
          setUnpinTarget(null);
          if (target) await togglePin(target);
        }}
      />

      <ConfirmDialog
        open={!!deleteChat}
        onOpenChange={(v) => !v && setDeleteChat(null)}
        title={`Delete chat with ${deleteChat?.title ?? ""}?`}
        description="This permanently removes the conversation and every message in it, for everyone. It can't be undone."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const target = deleteChat;
          setDeleteChat(null);
          if (target) await deleteConversation(target);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteConfirm}
        onOpenChange={setBulkDeleteConfirm}
        title={`Delete ${selectedIds.size} message${selectedIds.size === 1 ? "" : "s"}?`}
        description="This removes the selected messages for you only. It can't be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          setBulkDeleteConfirm(false);
          await deleteSelected();
        }}
      />

      {infoUserDialog.value && (
        <UserInfoDialog
          open={infoUserDialog.open}
          user={infoUserDialog.value}
          online={onlineIds.has(infoUserDialog.value.id)}
          onClose={() => setInfoUser(null)}
        />
      )}

      {previewDialog.value && (
        <AttachmentPreview open={previewDialog.open} attachment={previewDialog.value} onClose={() => setPreview(null)} />
      )}
      {forwardDialog.value && (
        <ForwardDialog
          open={forwardDialog.open}
          message={forwardDialog.value}
          conversations={conversations.filter((c) => c.id !== activeId)}
          onClose={() => setForwardOf(null)}
          onDone={(n) => {
            setForwardOf(null);
            toast.success(`Forwarded to ${n} chat${n === 1 ? "" : "s"}`);
            loadConversations();
          }}
        />
      )}
      <NewConversationDialog
        open={newOpen}
        users={users.filter((u) => u.id !== me.id)}
        isAdmin={me.isAdmin}
        onClose={() => setNewOpen(false)}
        onCreated={async (id) => {
          setNewOpen(false);
          await loadConversations();
          openConversation(id);
        }}
      />
    </div>
  );
}

/* ------------------------------- sub-pieces -------------------------------- */

function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/5",
        danger && "text-destructive"
      )}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
    >
      {children}
    </motion.button>
  );
}

function StatusTicks({ status }: { status: "sent" | "delivered" | "seen" }) {
  if (status === "sent") return <span className="text-[10px] opacity-70">✓</span>;
  return <span className={cn("text-[10px]", status === "seen" ? "text-sky-300" : "opacity-70")}>✓✓</span>;
}

/**
 * Wraps every occurrence of the search text.
 *
 * Case-insensitive but preserves what was actually typed in the message, so a
 * search for "ok" doesn't rewrite "OK" in the thread. The current result is
 * tinted differently from the rest, which is the only way to tell which one the
 * up/down arrows are sitting on.
 */
function Highlighted({ text, query, active }: { text: string; query: string; active: boolean }) {
  const q = query.trim();
  if (!q) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={at}
        className={cn(
          "rounded-sm px-0.5",
          active ? "bg-amber-400 text-black" : "bg-amber-400/40 text-inherit"
        )}
      >
        {text.slice(at, at + q.length)}
      </mark>
    );
    from = at + q.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

function MessageBubble({
  message: m,
  mine,
  group,
  status,
  expanded,
  onToggleExpand,
  onContext,
  onOpenAttachment,
  onQuoteClick,
  onReact,
  meId,
  selectMode,
  selected,
  onSelectToggle,
  onSenderClick,
  members,
  highlight,
  isActiveMatch,
}: {
  message: Message;
  mine: boolean;
  group: boolean;
  status: "sent" | "delivered" | "seen";
  expanded: boolean;
  onToggleExpand: () => void;
  onContext: (x: number, y: number) => void;
  onOpenAttachment: (a: Attachment) => void;
  onQuoteClick: (id: string) => void;
  onReact: (m: Message, emoji: string) => void;
  meId: string;
  selectMode: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onSenderClick: () => void;
  /** People who can be @mentioned here — used to match full names and fill the hover card. */
  members: ChatUser[];
  /** Search text to mark up in the body, if a search is running. */
  highlight?: string;
  /** This bubble is the result the up/down arrows are currently on. */
  isActiveMatch?: boolean;
}) {
  const long = m.body.length > LONG_BODY;
  const shown = long && !expanded ? `${m.body.slice(0, LONG_BODY)}…` : m.body;
  // A message that's just a few emoji renders them large, like iOS/WhatsApp.
  const emojiOnly = isEmojiOnly(m.body) && countEmoji(m.body) <= 3 && m.attachments.length === 0;
  // Taken from the full body, not the truncated `shown`, so a link past the
  // "Read more" cut still unfurls.
  const firstLink = useMemo(
    () => (m.deletedForEveryone ? undefined : extractUrls(m.body)[0]),
    [m.body, m.deletedForEveryone]
  );

  // group identical emoji into counts
  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of m.reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      map.set(r.emoji, { count: cur.count + 1, mine: cur.mine || r.userId === meId });
    }
    return [...map.entries()];
  }, [m.reactions, meId]);

  return (
    <motion.div
      id={`msg-${m.id}`}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 480, damping: 34 }}
      onClick={() => selectMode && onSelectToggle()}
      className={cn(
        "group flex items-end gap-2 rounded-lg px-0.5 py-0.5 transition-colors",
        mine ? "justify-end" : "justify-start",
        selectMode && "cursor-pointer hover:bg-primary/5",
        selected && "bg-primary/10"
      )}
    >
      {/* Sender's photo on incoming messages — tap it for their profile. */}
      {!mine && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSenderClick();
          }}
          title={fullName(m.sender)}
          className="mb-4 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
        >
          {m.sender.avatarDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.sender.avatarDataUrl} alt={fullName(m.sender)} className="h-full w-full object-cover" />
          ) : (
            initial(fullName(m.sender))
          )}
        </button>
      )}
      {selectMode && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-input"
          )}
        >
          {selected && <IconCheck className="h-3 w-3" />}
        </motion.span>
      )}
      <motion.div
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        // On the bubble, not the row: the row spans the full width, so having
        // these on it meant right-clicking empty space beside a message opened
        // that message's menu.
        onContextMenu={(e) => {
          e.preventDefault();
          onContext(e.clientX, e.clientY);
        }}
        // Double-click opens the same actions (delete for me / everyone, info…).
        onDoubleClick={(e) => {
          e.preventDefault();
          onContext(e.clientX, e.clientY);
        }}
        className={cn(
          "relative max-w-[78%] rounded-3xl px-3.5 py-2 text-sm shadow-sm",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"
        )}
      >
        {m.pinnedAt && <IconPin className="absolute -top-1.5 right-2 h-3 w-3 opacity-70" />}

        {/* Name and time share a row: the timestamp had its own line under
            every bubble, which cost a line of height on every message. */}
        {!m.deletedForEveryone && (!mine && group) && (
          <p className="mb-0.5 flex items-baseline gap-2 text-[11px] font-medium opacity-70">
            <span className="min-w-0 truncate">{fullName(m.sender)}</span>
            <span className="ml-auto shrink-0 tabular-nums opacity-80">{fmtTime(m.createdAt)}</span>
          </p>
        )}

        {m.forwardedFromName && !m.deletedForEveryone && (
          <p className={cn("mb-0.5 text-[11px] italic", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
            <IconForward className="mr-1 inline h-3 w-3" />Forwarded from {m.forwardedFromName}
          </p>
        )}

        {m.replyTo && !m.deletedForEveryone && (
          <button
            type="button"
            onClick={() => onQuoteClick(m.replyTo!.id)}
            className={cn(
              "mb-1 flex w-full gap-2 rounded-lg border-l-2 px-2 py-1 text-left text-xs transition-opacity hover:opacity-80",
              mine ? "border-primary-foreground/50 bg-primary-foreground/10" : "border-primary bg-background/50"
            )}
          >
            <span className="min-w-0">
              <span className="block font-medium">{fullName(m.replyTo.sender)}</span>
              <span className="block truncate opacity-80">
                {m.replyTo.deletedForEveryone ? "Deleted message" : m.replyTo.body || m.replyTo.attachments[0]?.name || "Attachment"}
              </span>
            </span>
          </button>
        )}

        {m.deletedForEveryone ? (
          <p className={cn("italic", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>This message was deleted</p>
        ) : (
          <>
            {m.attachments.length > 0 && (
              <div className="mb-1 flex flex-col gap-1.5">
                {m.attachments.map((a) =>
                  isAudio(a.mimeType) ? (
                    <audio
                      key={a.id}
                      src={a.data}
                      controls
                      preload="metadata"
                      className="h-9 w-56 max-w-full"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : isImage(a.mimeType) ? (
                    <motion.button
                      key={a.id}
                      type="button"
                      onClick={() => onOpenAttachment(a)}
                      className="overflow-hidden rounded-xl"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.data} alt={a.name} className="max-h-56 rounded-xl object-cover" />
                    </motion.button>
                  ) : (
                    <motion.button
                      key={a.id}
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onOpenAttachment(a)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                        mine ? "border-primary-foreground/30 hover:bg-primary-foreground/10" : "border-border hover:bg-background/60"
                      )}
                    >
                      <FileIcon mime={a.mimeType} className="h-5 w-5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block max-w-44 truncate text-xs font-medium">{a.name}</span>
                        <span className={cn("text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{fmtSize(a.size)}</span>
                      </span>
                    </motion.button>
                  )
                )}
              </div>
            )}

            {m.body && (
              <p className={cn("whitespace-pre-wrap break-words", emojiOnly && "py-1")}>
                <TextWithAnimatedEmoji
                  text={shown}
                  emojiClass={emojiOnly ? "h-11 w-11" : "h-[1.15em] w-[1.15em]"}
                  renderText={(chunk, key) => (
                    <span key={key}>
                      {tokenizeLinks(chunk).map((part, pi) =>
                        part.type === "url" ? (
                          <a
                            key={pi}
                            href={part.href}
                            target="_blank"
                            // noreferrer as well as noopener: the linked site has
                            // no business knowing which CRM page it came from.
                            rel="noopener noreferrer nofollow"
                            // The bubble has its own click handlers (menu,
                            // double-click); following a link shouldn't fire them.
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "break-all underline underline-offset-2",
                              mine ? "text-primary-foreground" : "text-primary"
                            )}
                          >
                            {part.value}
                          </a>
                        ) : (
                          <span key={pi}>
                            {tokenizeMentions(part.value, members).map((tok, i) =>
                              tok.type === "text" && highlight ? (
                                <Highlighted key={i} text={tok.value} query={highlight} active={!!isActiveMatch} />
                              ) : tok.type === "mention" ? (
                                <MentionChip
                                  key={i}
                                  label={tok.value}
                                  mine={mine}
                                  user={members.find((u) => u.id === tok.person.id)}
                                />
                              ) : (
                                <span key={i}>{tok.value}</span>
                              )
                            )}
                          </span>
                        )
                      )}
                    </span>
                  )}
                />
                {long && (
                  <button
                    type="button"
                    onClick={onToggleExpand}
                    className={cn("ml-1 text-xs font-medium underline", mine ? "text-primary-foreground/80" : "text-primary")}
                  >
                    {expanded ? "Show less" : "Read more"}
                  </button>
                )}
              </p>
            )}

            {/* Unfurl the first link. Only one: a message with five links would
                otherwise become a wall of cards. */}
            {firstLink && <LinkPreview url={firstLink} mine={mine} />}
          </>
        )}

        {/* Own messages and direct chats have no sender row, so they keep a
            compact footer — it also carries the delivery ticks. */}
        {(mine || !group || m.deletedForEveryone) && (
          <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
            <span>{fmtTime(m.createdAt)}</span>
            {mine && !m.deletedForEveryone && <StatusTicks status={status} />}
          </div>
        )}

        {/* Reactions */}
        <AnimatePresence>
          {grouped.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={cn("absolute -bottom-3 flex gap-0.5 rounded-full border border-border bg-popover px-1.5 py-0.5 shadow-sm", mine ? "right-2" : "left-2")}
            >
              {grouped.map(([emoji, info]) => (
                <motion.button
                  key={emoji}
                  type="button"
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onReact(m, emoji)}
                  className={cn("flex items-center gap-0.5 leading-none", info.mine && "font-bold")}
                >
                  <AnimatedEmoji emoji={emoji} className="h-3.5 w-3.5" />
                  {info.count > 1 && <span className="text-[9px] text-muted-foreground">{info.count}</span>}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// Shared across bubbles so the same link pasted repeatedly is fetched once per
// session; the server caches too, but this avoids the round trip entirely.
const linkPreviewCache = new Map<string, LinkPreviewData | null>();
const linkPreviewInFlight = new Map<string, Promise<LinkPreviewData | null>>();

function loadLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const cached = linkPreviewCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  // Several bubbles can mount at once with the same link — share the request.
  const existing = linkPreviewInFlight.get(url);
  if (existing) return existing;

  const p = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.preview ?? null) as LinkPreviewData | null)
    .catch(() => null)
    .then((value) => {
      linkPreviewCache.set(url, value);
      linkPreviewInFlight.delete(url);
      return value;
    });
  linkPreviewInFlight.set(url, p);
  return p;
}

/**
 * Card for the first link in a message. Renders nothing at all until there's
 * something worth showing, so an unfurlable link never leaves a skeleton or an
 * error box sitting in the thread.
 */
function LinkPreview({ url, mine }: { url: string; mine: boolean }) {
  const [data, setData] = useState<LinkPreviewData | null>(() => linkPreviewCache.get(url) ?? null);

  useEffect(() => {
    let active = true;
    loadLinkPreview(url).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [url]);

  if (!data) return null;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "mt-1.5 block overflow-hidden rounded-lg border transition-colors",
        mine
          ? "border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/15"
          : "border-border bg-background/60 hover:bg-primary/5"
      )}
    >
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          loading="lazy"
          className="h-32 w-full object-cover"
          // A dead or hotlink-blocked image shouldn't leave a broken icon.
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="px-2.5 py-2">
        <p className={cn("text-[10px] uppercase tracking-wide", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
          {data.siteName || displayUrl(data.url, 32)}
        </p>
        {data.title && <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">{data.title}</p>}
        {data.description && (
          <p className={cn("mt-0.5 line-clamp-2 text-[11px] leading-snug", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}

function AttachmentPreview({ open, attachment: a, onClose }: { open: boolean; attachment: Attachment; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            <span className="flex items-center gap-2"><FileIcon mime={a.mimeType} className="h-4 w-4 shrink-0" />{a.name}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isImage(a.mimeType) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.data} alt={a.name} className="mx-auto max-h-[60vh] rounded-lg object-contain" />
          ) : a.mimeType.includes("pdf") ? (
            <iframe src={a.data} title={a.name} className="h-[60vh] w-full rounded-lg border border-border" />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <FileIcon mime={a.mimeType} className="h-14 w-14 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {a.name} · {fmtSize(a.size)}
              </p>
              <p className="text-xs text-muted-foreground">No inline preview for this file type.</p>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <a href={a.data} download={a.name}>
              <Button type="button" variant="outline" size="sm">
                Download
              </Button>
            </a>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ForwardDialog({
  open,
  message,
  conversations,
  onClose,
  onDone,
}: {
  open: boolean;
  message: Message;
  conversations: Conversation[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function forward() {
    if (selected.size === 0) return toast.error("Pick at least one chat");
    setBusy(true);
    try {
      const res = await fetch("/api/messages/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, conversationIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't forward", data.error);
      onDone(data.forwarded ?? selected.size);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="mb-2 truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {message.body || message.attachments[0]?.name || "Attachment"}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {conversations.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No other chats.</p>
            ) : (
              conversations.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0 hover:bg-primary/5">
                  <Checkbox
                    checked={selected.has(c.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                    aria-label={`Forward to ${c.title}`}
                  />
                  <span className="truncate text-sm">{c.title}</span>
                </label>
              ))
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" onClick={forward} disabled={busy}>
              <IconCheck className="h-4 w-4" />
              {busy ? "Forwarding…" : `Forward (${selected.size})`}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Avatar({ title, group, online, image }: { title: string; group: boolean; online?: boolean; image?: string | null }) {
  return (
    <div className="relative shrink-0">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={title} className="h-full w-full object-cover" />
        ) : group ? (
          <IconUsers className="h-5 w-5" />
        ) : (
          initial(title)
        )}
      </div>
      {online !== undefined && (
        <motion.span
          initial={false}
          animate={{ scale: online ? 1 : 0.85 }}
          className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card", online ? "bg-emerald-500" : "bg-muted-foreground/40")}
        />
      )}
    </div>
  );
}

/**
 * The whole Noto animated set, scrollable. Emoji render as a still frame and
 * only animate on hover, and the list grows as you scroll so opening the panel
 * never renders 881 images at once.
 */
function EmojiGrid({ active, onPick }: { active: boolean; onPick: (char: string) => void }) {
  const PAGE = 160;
  const [limit, setLimit] = useState(PAGE);

  // Reset paging whenever the panel is dismissed.
  useEffect(() => {
    if (!active) setLimit(PAGE);
  }, [active]);

  const shown = NOTO_EMOJI.slice(0, limit);

  return (
    <div
      className="max-h-72 overflow-y-auto p-2"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
          setLimit((n) => Math.min(n + PAGE, NOTO_EMOJI.length));
        }
      }}
    >
      <div className="grid grid-cols-8 gap-1">
        {shown.map(([cp, char, catIdx, label], i) => (
          <Fragment key={cp}>
            {(i === 0 || shown[i - 1][2] !== catIdx) && (
              <p className="col-span-8 px-1 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {NOTO_CATEGORIES[catIdx]}
              </p>
            )}
            <Tooltip label={label} side="top">
            <motion.button
              type="button"
              whileHover={{ scale: 1.25 }}
              whileTap={{ scale: 0.9 }}
              tabIndex={active ? 0 : -1}
              onClick={() => onPick(char)}
              aria-label={label}
              className="flex items-center justify-center rounded p-1"
            >
              <AnimatedEmoji emoji={char} sizePx={24} playOnHover lazy />
            </motion.button>
            </Tooltip>
          </Fragment>
        ))}
      </div>
      {limit < NOTO_EMOJI.length && (
        <p className="py-2 text-center text-[10px] text-muted-foreground">Scroll for more…</p>
      )}
    </div>
  );
}

function UserInfoDialog({ open, user, online, onClose }: { open: boolean; user: ChatUser; online: boolean; onClose: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: "Name", value: fullName(user) || "—" },
    { label: "Email", value: user.email ?? "—" },
    { label: "Contact", value: user.mobile || "—" },
    { label: "Department", value: user.department?.name ?? "—" },
    { label: "Role", value: user.role ? user.role.replace(/_/g, " ").toLowerCase() : "—" },
  ];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact info</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-2xl font-semibold text-primary">
                {user.avatarDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarDataUrl} alt={fullName(user)} className="h-full w-full object-cover" />
                ) : (
                  initial(fullName(user))
                )}
              </div>
              <span
                className={cn(
                  "absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-popover",
                  online ? "bg-emerald-500" : "bg-muted-foreground/40"
                )}
              />
            </div>
            <p className="text-base font-medium">{fullName(user)}</p>
            <p className={cn("text-xs", online ? "text-emerald-500" : "text-muted-foreground")}>
              {online ? "Active now" : "Offline"}
            </p>
          </div>

          <div className="mt-4 divide-y divide-border/60 rounded-md border border-border">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="truncate text-right font-medium capitalize">{r.value}</span>
              </div>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function GroupInfoDialog({
  open,
  conversation,
  canEdit,
  onClose,
  onSaved,
}: {
  open: boolean;
  conversation: Conversation;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(conversation.title);
  const [description, setDescription] = useState(conversation.description ?? "");
  const [image, setImage] = useState<string | null>(conversation.imageDataUrl);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const adminIds = conversation.groupAdminIds ?? [];

  async function setGroupAdmin(userId: string, isGroupAdmin: boolean, days?: number) {
    setPromoting(userId);
    try {
      // Days rather than a date picker: "for a week" is the actual intent, and
      // it avoids someone picking a time that's already passed.
      const until =
        isGroupAdmin && days
          ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
          : null;
      const res = await fetch(`/api/conversations/${conversation.id}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isGroupAdmin, until }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't change group admin", data.error);
      toast.success(isGroupAdmin ? "Now a group admin" : "No longer a group admin");
      // Reload so the badge and the button reflect the server, not a guess.
      onSaved();
    } finally {
      setPromoting(null);
    }
  }

  // The dialog outlives a single opening now, so refresh the fields each time
  // it opens (and whenever the conversation changes underneath it).
  useEffect(() => {
    if (!open) return;
    setTitle(conversation.title);
    setDescription(conversation.description ?? "");
    setImage(conversation.imageDataUrl);
  }, [open, conversation.id, conversation.title, conversation.description, conversation.imageDataUrl]);

  async function onPickImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 3 * 1024 * 1024) return toast.error("Image must be under 3MB");
    const a = await readFile(file);
    setImage(a.data);
    if (pickRef.current) pickRef.current.value = "";
  }

  async function save() {
    if (!title.trim()) return toast.error("Group name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, imageDataUrl: image }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save group info", data.error);
      toast.success("Group info updated");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group info</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-2xl font-semibold text-primary">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={title} className="h-full w-full object-cover" />
                ) : (
                  <IconUsers className="h-10 w-10" />
                )}
              </div>
              {canEdit && (
                <>
                  <input ref={pickRef} type="file" accept="image/*" hidden onChange={(e) => onPickImage(e.target.files)} />
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => pickRef.current?.click()}
                    aria-label="Change group picture"
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-popover bg-primary text-primary-foreground"
                  >
                    <IconImage className="h-4 w-4" />
                  </motion.button>
                </>
              )}
            </div>
            {canEdit && image && (
              <button type="button" onClick={() => setImage(null)} className="text-xs text-muted-foreground hover:text-destructive">
                Remove picture
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grp-name">Name</Label>
              <Input id="grp-name" value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grp-desc">Description</Label>
              <Textarea
                id="grp-desc"
                value={description}
                disabled={!canEdit}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this group for?"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{conversation.members.length} members</Label>
              <div className="max-h-44 overflow-y-auto rounded-md border border-border">
                {conversation.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 border-b border-border/50 px-3 py-2 last:border-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {m.avatarDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.avatarDataUrl} alt={fullName(m)} className="h-full w-full object-cover" />
                      ) : (
                        initial(fullName(m))
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm">{fullName(m)}</span>
                        {adminIds.includes(m.id) && (
                          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Admin
                          </span>
                        )}
                      </span>
                      {m.email && <span className="block truncate text-xs text-muted-foreground">{m.email}</span>}
                    </span>
                    {canEdit &&
                      (adminIds.includes(m.id) ? (
                        <button
                          type="button"
                          disabled={promoting === m.id}
                          onClick={() => setGroupAdmin(m.id, false)}
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                        >
                          {promoting === m.id ? "…" : "Remove admin"}
                        </button>
                      ) : (
                        <Popover.Root>
                          <Popover.Trigger asChild>
                            <button
                              type="button"
                              disabled={promoting === m.id}
                              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                            >
                              {promoting === m.id ? "…" : "Make admin"}
                            </button>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content
                              align="end"
                              sideOffset={4}
                              className="z-[60] w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                            >
                              {[
                                { label: "Indefinitely", days: undefined },
                                { label: "For 1 day", days: 1 },
                                { label: "For 7 days", days: 7 },
                                { label: "For 30 days", days: 30 },
                              ].map((opt) => (
                                <button
                                  key={opt.label}
                                  type="button"
                                  onClick={() => setGroupAdmin(m.id, true, opt.days)}
                                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-primary/5"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function NewConversationDialog({
  open,
  users,
  isAdmin,
  onClose,
  onCreated,
}: {
  open: boolean;
  users: ChatUser[];
  isAdmin: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function startDirect(userId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DIRECT", userId }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't start chat", data.error);
      onCreated(data.id);
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!title.trim()) return toast.error("Enter a group name");
    if (selected.size === 0) return toast.error("Add at least one member");
    setBusy(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "GROUP", title: title.trim(), memberIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't create group", data.error);
      onCreated(data.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* Fixed height: switching between Direct message and Group swaps in a
          name field and a submit button, and letting the dialog resize to fit
          made it jump around under the cursor. The user list absorbs the
          difference instead. */}
      <DialogContent className="h-[32rem]">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col overflow-y-hidden">
          {isAdmin && (
            <div className="mb-3 flex gap-1 rounded-md bg-muted p-1">
              {(["direct", "group"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("flex-1 rounded px-3 py-1.5 text-sm transition-colors", mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                >
                  {m === "direct" ? "Direct message" : "Group"}
                </button>
              ))}
            </div>
          )}

          {mode === "group" && isAdmin && (
            <div className="mb-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group name" />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            {users.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No users available.</p>
            ) : (
              users.map((u) =>
                mode === "group" && isAdmin ? (
                  <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0 hover:bg-primary/5">
                    <Checkbox
                      checked={selected.has(u.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
                      aria-label={`Add ${u.name}`}
                    />
                    <UserLabel user={u} />
                  </label>
                ) : (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy}
                    onClick={() => startDirect(u.id)}
                    className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-primary/5 disabled:opacity-60"
                  >
                    <UserLabel user={u} />
                  </button>
                )
              )
            )}
          </div>

          {mode === "group" && isAdmin && (
            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={createGroup} disabled={busy}>
                {busy ? "Creating…" : `Create group (${selected.size})`}
              </Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function UserLabel({ user }: { user: ChatUser }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm">{fullName(user)}</span>
      {user.role && <span className="block truncate text-xs capitalize text-muted-foreground">{user.role.replace(/_/g, " ").toLowerCase()}</span>}
    </span>
  );
}
