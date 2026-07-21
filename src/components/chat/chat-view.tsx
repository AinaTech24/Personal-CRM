"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, isToday, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EightDotsRotate } from "@/components/ui/loader";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import {
  IconPlus,
  IconSend,
  IconUsers,
  IconChevronLeft,
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
  IconDots,
} from "@/components/icons";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { AnimatedEmoji, TextWithAnimatedEmoji, isEmojiOnly, countEmoji } from "@/components/ui/animated-emoji";
import { cn } from "@/lib/utils";

/* ---------------------------------- types --------------------------------- */

interface ChatUser {
  id: string;
  name: string;
  surname: string | null;
  avatarDataUrl: string | null;
  role?: string;
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

const EMOJIS = "😀 😄 😁 😂 🤣 😊 😍 😘 😎 🤩 🥳 🤔 😴 😅 😇 🙂 😉 😌 😔 😢 😭 😡 👍 👎 👏 🙏 💪 🔥 ✨ 🎉 ❤️ 💯 👀 ✅ ❌ ⚡ 🚀 🎯 📌 📎".split(" ");
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";
const MAX_BYTES = 10 * 1024 * 1024;
const LONG_BODY = 420;

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");
const initial = (t: string) => (t.trim()[0] ?? "?").toUpperCase();
const fmtTime = (s: string) => format(parseISO(s), "h:mm a");
const fmtWhen = (s: string) => (isToday(parseISO(s)) ? fmtTime(s) : format(parseISO(s), "MMM d"));
const isImage = (m: string) => m.startsWith("image/");
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
    setTimeout(() => ctx.close().catch(() => {}), 500);
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
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
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
    socket.on("conversation", loadConversations);
    return () => {
      socket.off("message", onMessage);
      socket.off("message:update", onUpdate);
      socket.off("message:hidden", onHidden);
      socket.off("read", onRead);
      socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping);
      socket.off("conversation", loadConversations);
    };
  }, [socket, upsertMessage, loadConversations, me.id]);

  /* close the header menu on an outside click */
  useEffect(() => {
    if (!threadMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-thread-menu]")) return;
      setThreadMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [threadMenuOpen]);

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

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center">
        <EightDotsRotate className="h-9 w-9" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-xl border border-border bg-card/30">
      {/* Conversation list */}
      <div className={cn("flex w-full flex-col border-r border-border sm:w-72 lg:w-80", activeId && "hidden sm:flex")}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h1 className="text-base font-semibold">Messages</h1>
          <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
            <IconPlus className="h-4 w-4" />
            New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const other = c.type === "DIRECT" ? c.members.find((m) => m.id !== me.id) : null;
            return (
              <motion.button
                key={c.id}
                type="button"
                whileHover={{ x: 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                onClick={() => openConversation(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                  activeId === c.id && "bg-accent/60"
                )}
              >
                <Avatar title={c.title} group={c.type === "GROUP"} online={other ? onlineIds.has(other.id) : undefined} />
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
              </motion.button>
            );
          })}
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

              {active.type === "GROUP" && (
                <div className="relative" data-thread-menu>
                  <IconButton label="More" onClick={() => setThreadMenuOpen((v) => !v)}>
                    <IconDots className="h-4.5 w-4.5" />
                  </IconButton>
                  <AnimatePresence>
                    {threadMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl"
                      >
                        <MenuItem
                          onClick={() => {
                            setThreadMenuOpen(false);
                            setGroupInfoOpen(true);
                          }}
                        >
                          <IconUsers className="h-4 w-4" /> Group info
                        </MenuItem>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Pinned bar */}
            <AnimatePresence initial={false}>
              {pinned.length > 0 && (
                <motion.button
                  type="button"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onClick={() => scrollToMessage(pinned[pinned.length - 1].id)}
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

            <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto p-4">
              {loadingThread ? (
                <div className="flex h-full flex-1 items-center justify-center">
                  <EightDotsRotate className="h-7 w-7" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hello 👋</p>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
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
                    />
                  ))}
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
                    <IconButton label="Delete selected" onClick={deleteSelected}>
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
            <div className="relative flex items-center gap-1.5 border-t border-border p-3">
              <AnimatePresence>
                {mention && mentionMatches.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.97 }}
                    className="absolute bottom-full left-3 mb-1 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
                  >
                    {mentionMatches.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setDraft((prev) => prev.replace(/(^|\s)@([\w.]*)$/, `$1@${fullName(u)} `));
                          setMention(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
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
                  className="absolute bottom-full left-3 mb-1 grid w-64 origin-bottom-left grid-cols-8 gap-1 rounded-xl border border-border bg-popover p-2 shadow-lg"
                >
                  {EMOJIS.map((e) => (
                    <motion.button
                      key={e}
                      type="button"
                      whileHover={{ scale: 1.25 }}
                      whileTap={{ scale: 0.9 }}
                      tabIndex={emojiOpen ? 0 : -1}
                      onClick={() => {
                        setDraft((prev) => prev + e);
                        setEmojiOpen(false);
                      }}
                      className="flex items-center justify-center rounded p-1"
                    >
                      <AnimatedEmoji emoji={e} className="h-6 w-6" />
                    </motion.button>
                  ))}
                </div>
              )}

              <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
              <IconButton label="Attach" onClick={() => fileRef.current?.click()}>
                <IconPaperclip className="h-4.5 w-4.5" />
              </IconButton>
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
              <Input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={pending.length ? "Add a description…" : "Type a message… use @ to mention"}
              />
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.88, rotate: -12 }}
                transition={{ type: "spring", stiffness: 600, damping: 20 }}
                onClick={send}
                disabled={sending || (!draft.trim() && pending.length === 0)}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                <IconSend className="h-4 w-4" />
              </motion.button>
            </div>
          </>
        )}
      </div>

      {/* Right-click menu */}
      <AnimatePresence>
        {ctx && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.12 }}
            style={{ left: Math.min(ctx.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 230), top: ctx.y }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-2xl"
          >
            {!ctx.message.deletedForEveryone && (
              <div className="flex justify-around border-b border-border px-1 pb-1.5 pt-1">
                {QUICK_REACTIONS.map((e) => (
                  <motion.button
                    key={e}
                    type="button"
                    whileHover={{ scale: 1.3 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => react(ctx.message, e)}
                    className="flex items-center justify-center rounded p-0.5"
                  >
                    <AnimatedEmoji emoji={e} className="h-6 w-6" />
                  </motion.button>
                ))}
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
                <MenuItem onClick={() => togglePin(ctx.message)}>
                  <IconPin className="h-4 w-4" /> {ctx.message.pinnedAt ? "Unpin" : "Pin"}
                </MenuItem>
              </>
            )}
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

      {groupInfoOpen && active && (
        <GroupInfoDialog
          conversation={active}
          canEdit={me.isAdmin}
          onClose={() => setGroupInfoOpen(false)}
          onSaved={() => {
            setGroupInfoOpen(false);
            loadConversations();
          }}
        />
      )}

      {preview && <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />}
      {forwardOf && (
        <ForwardDialog
          message={forwardOf}
          conversations={conversations.filter((c) => c.id !== activeId)}
          onClose={() => setForwardOf(null)}
          onDone={(n) => {
            setForwardOf(null);
            toast.success(`Forwarded to ${n} chat${n === 1 ? "" : "s"}`);
            loadConversations();
          }}
        />
      )}
      {newOpen && (
        <NewConversationDialog
          users={users.filter((u) => u.id !== me.id)}
          isAdmin={me.isAdmin}
          onClose={() => setNewOpen(false)}
          onCreated={async (id) => {
            setNewOpen(false);
            await loadConversations();
            openConversation(id);
          }}
        />
      )}
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
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
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
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </motion.button>
  );
}

function StatusTicks({ status }: { status: "sent" | "delivered" | "seen" }) {
  if (status === "sent") return <span className="text-[10px] opacity-70">✓</span>;
  return <span className={cn("text-[10px]", status === "seen" ? "text-sky-300" : "opacity-70")}>✓✓</span>;
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
}) {
  const long = m.body.length > LONG_BODY;
  const shown = long && !expanded ? `${m.body.slice(0, LONG_BODY)}…` : m.body;
  // A message that's just a few emoji renders them large, like iOS/WhatsApp.
  const emojiOnly = isEmojiOnly(m.body) && countEmoji(m.body) <= 3 && m.attachments.length === 0;

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
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(e.clientX, e.clientY);
      }}
      onClick={() => selectMode && onSelectToggle()}
      className={cn(
        "group flex items-center gap-2 rounded-lg px-0.5 py-0.5 transition-colors",
        mine ? "justify-end" : "justify-start",
        selectMode && "cursor-pointer hover:bg-accent/40",
        selected && "bg-primary/10"
      )}
    >
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
        whileHover={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "relative max-w-[78%] rounded-3xl px-3.5 py-2 text-sm shadow-sm",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"
        )}
      >
        {m.pinnedAt && <IconPin className="absolute -top-1.5 right-2 h-3 w-3 opacity-70" />}

        {!mine && group && !m.deletedForEveryone && <p className="mb-0.5 text-[11px] font-medium opacity-70">{fullName(m.sender)}</p>}

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
                  isImage(a.mimeType) ? (
                    <motion.button
                      key={a.id}
                      type="button"
                      whileHover={{ scale: 1.02 }}
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
                      whileHover={{ scale: 1.015 }}
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
                      {chunk.split(/(\s+)/).map((tok, i) =>
                        tok.startsWith("@") && tok.length > 1 ? (
                          <span key={i} className={cn("font-medium", mine ? "underline" : "text-primary")}>
                            {tok}
                          </span>
                        ) : (
                          <span key={i}>{tok}</span>
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
          </>
        )}

        <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
          <span>{fmtTime(m.createdAt)}</span>
          {mine && !m.deletedForEveryone && <StatusTicks status={status} />}
        </div>

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

function AttachmentPreview({ attachment: a, onClose }: { attachment: Attachment; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
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
  message,
  conversations,
  onClose,
  onDone,
}: {
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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
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
                <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0 hover:bg-accent/50">
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

function GroupInfoDialog({
  conversation,
  canEdit,
  onClose,
  onSaved,
}: {
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
  const pickRef = useRef<HTMLInputElement>(null);

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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
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
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {initial(fullName(m))}
                    </span>
                    <span className="truncate text-sm">{fullName(m)}</span>
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
  users,
  isAdmin,
  onClose,
  onCreated,
}: {
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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>
        <DialogBody>
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

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {users.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No users available.</p>
            ) : (
              users.map((u) =>
                mode === "group" && isAdmin ? (
                  <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0 hover:bg-accent/50">
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
                    className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-accent/50 disabled:opacity-60"
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
