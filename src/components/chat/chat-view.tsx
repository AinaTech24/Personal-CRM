"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, isToday, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EightDotsRotate } from "@/components/ui/loader";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { IconPlus, IconSend, IconUsers, IconChevronLeft, IconSmile, IconPaperclip, IconX } from "@/components/icons";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

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
interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  isSystem: boolean;
  title: string;
  members: ChatUser[];
  lastMessage: { body: string; senderName: string; createdAt: string } | null;
  updatedAt: string;
  unread: number;
}
interface Message {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: ChatUser;
  attachments: Attachment[];
}
interface PendingAttachment {
  name: string;
  mimeType: string;
  size: number;
  data: string;
}

const EMOJIS = "😀 😄 😁 😂 🤣 😊 😍 😘 😎 🤩 🥳 🤔 😴 😅 😇 🙂 😉 😌 😔 😢 😭 😡 👍 👎 👏 🙏 💪 🔥 ✨ 🎉 ❤️ 💯 👀 ✅ ❌ ⚡ 🚀 🎯 📌 📎".split(" ");
const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";
const MAX_BYTES = 10 * 1024 * 1024;

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");
const initial = (t: string) => (t.trim()[0] ?? "?").toUpperCase();
const fmtTime = (s: string) => format(parseISO(s), "h:mm a");
const fmtWhen = (s: string) => (isToday(parseISO(s)) ? fmtTime(s) : format(parseISO(s), "MMM d"));
const isImage = (m: string) => m.startsWith("image/");
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function readFile(file: File): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data: String(reader.result) });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
      // Swap conversation socket rooms so typing events target the right thread.
      if (socket) {
        if (activeIdRef.current) socket.emit("leave", `conv:${activeIdRef.current}`);
        socket.emit("join", `conv:${id}`);
      }
      setActiveId(id);
      setTypingNames([]);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, typingNames]);

  const appendMessage = useCallback((m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Presence roster.
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

  // Incoming messages + typing + new conversations.
  useEffect(() => {
    if (!socket) return;
    const onMessage = (payload: { conversationId: string; message: Message }) => {
      const { conversationId, message } = payload;
      if (conversationId === activeIdRef.current) {
        appendMessage(message);
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
    const onConversation = () => loadConversations();
    socket.on("message", onMessage);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);
    socket.on("conversation", onConversation);
    return () => {
      socket.off("message", onMessage);
      socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping);
      socket.off("conversation", onConversation);
    };
  }, [socket, appendMessage, loadConversations, me.id]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);
  const otherMember = active && active.type === "DIRECT" ? active.members.find((m) => m.id !== me.id) ?? null : null;
  const otherOnline = otherMember ? onlineIds.has(otherMember.id) : false;

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
    // @-mention: detect a trailing "@word" being typed.
    const m = value.match(/(?:^|\s)@([\w.]*)$/);
    setMention(m ? { query: m[1] } : null);
  }

  function insertMention(u: ChatUser) {
    setDraft((prev) => prev.replace(/(^|\s)@([\w.]*)$/, `$1@${fullName(u)} `));
    setMention(null);
  }

  function insertEmoji(e: string) {
    setDraft((prev) => prev + e);
    setEmojiOpen(false);
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
    setPending((prev) => [...prev, ...picked].slice(0, 6));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const text = draft.trim();
    if ((!text && pending.length === 0) || !activeId || sending) return;
    setSending(true);
    setDraft("");
    const attachments = pending;
    setPending([]);
    if (socket) socket.emit("stop_typing", { conversationId: activeId, userId: me.id });
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, attachments }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't send", data.error);
        setDraft(text);
        setPending(attachments);
        return;
      }
      appendMessage(data.message);
    } finally {
      setSending(false);
    }
  }

  const mentionMatches = useMemo(() => {
    if (!mention || !active) return [];
    const q = mention.query.toLowerCase();
    return active.members.filter((m) => m.id !== me.id && fullName(m).toLowerCase().includes(q)).slice(0, 6);
  }, [mention, active, me.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
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
          {conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            conversations.map((c) => {
              const other = c.type === "DIRECT" ? c.members.find((m) => m.id !== me.id) : null;
              return (
                <button
                  key={c.id}
                  type="button"
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
                  {c.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                </button>
              );
            })
          )}
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
              <Avatar title={active.title} group={active.type === "GROUP"} online={otherMember ? otherOnline : undefined} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{active.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {active.type === "GROUP" ? `${active.members.length} members` : otherOnline ? <span className="text-emerald-500">Active now</span> : "Offline"}
                </p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {loadingThread ? (
                <div className="flex justify-center py-8">
                  <EightDotsRotate className="h-7 w-7" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hello 👋</p>
              ) : (
                messages.map((m) => <MessageBubble key={m.id} message={m} mine={m.senderId === me.id} group={active.type === "GROUP"} />)
              )}
              {typingNames.length > 0 && (
                <p className="px-1 text-xs italic text-muted-foreground">
                  {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
                </p>
              )}
            </div>

            {/* Pending attachments */}
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border px-3 pt-2">
                {pending.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
                    {isImage(a.mimeType) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.data} alt={a.name} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <span className="text-muted-foreground">📄</span>
                    )}
                    <span className="max-w-32 truncate">{a.name}</span>
                    <button type="button" onClick={() => setPending((prev) => prev.filter((_, x) => x !== i))} aria-label="Remove">
                      <IconX className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Composer */}
            <div className="relative flex items-center gap-1.5 border-t border-border p-3">
              {mention && mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-3 mb-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                  {mentionMatches.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {initial(fullName(u))}
                      </span>
                      {fullName(u)}
                    </button>
                  ))}
                </div>
              )}
              {emojiOpen && (
                <div className="absolute bottom-full left-3 mb-1 grid w-64 grid-cols-8 gap-1 rounded-md border border-border bg-popover p-2 shadow-lg">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" onClick={() => insertEmoji(e)} className="rounded p-1 text-lg hover:bg-accent">
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
              <IconButton label="Attach" onClick={() => fileRef.current?.click()}>
                <IconPaperclip className="h-4.5 w-4.5" />
              </IconButton>
              <IconButton label="Emoji" onClick={() => setEmojiOpen((v) => !v)}>
                <IconSmile className="h-4.5 w-4.5" />
              </IconButton>
              <Input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Type a message… use @ to mention"
              />
              <Button type="button" onClick={send} disabled={sending || (!draft.trim() && pending.length === 0)} size="sm">
                <IconSend className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

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

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function MessageBubble({ message: m, mine, group }: { message: Message; mine: boolean; group: boolean }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
        {!mine && group && <p className="mb-0.5 text-[11px] font-medium opacity-70">{fullName(m.sender)}</p>}
        {m.attachments.length > 0 && (
          <div className="mb-1 flex flex-col gap-1.5">
            {m.attachments.map((a) =>
              isImage(a.mimeType) ? (
                <a key={a.id} href={a.data} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.data} alt={a.name} className="max-h-60 rounded-lg object-cover" />
                </a>
              ) : (
                <a
                  key={a.id}
                  href={a.data}
                  download={a.name}
                  className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2", mine ? "border-primary-foreground/30" : "border-border")}
                >
                  <span>📄</span>
                  <span className="min-w-0">
                    <span className="block max-w-48 truncate">{a.name}</span>
                    <span className={cn("text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{fmtSize(a.size)}</span>
                  </span>
                </a>
              )
            )}
          </div>
        )}
        {m.body && <p className="whitespace-pre-wrap break-words">{renderWithMentions(m.body, mine)}</p>}
        <p className={cn("mt-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{fmtTime(m.createdAt)}</p>
      </div>
    </div>
  );
}

/** Highlight @mention tokens in a message body. */
function renderWithMentions(body: string, mine: boolean) {
  return body.split(/(\s+)/).map((tok, i) =>
    tok.startsWith("@") && tok.length > 1 ? (
      <span key={i} className={cn("font-medium", mine ? "underline" : "text-primary")}>
        {tok}
      </span>
    ) : (
      <span key={i}>{tok}</span>
    )
  );
}

function Avatar({ title, group, online }: { title: string; group: boolean; online?: boolean }) {
  return (
    <div className="relative shrink-0">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {group ? <IconUsers className="h-5 w-5" /> : initial(title)}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
            online ? "bg-emerald-500" : "bg-muted-foreground/40"
          )}
        />
      )}
    </div>
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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
                    <Checkbox checked={selected.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Add ${u.name}`} />
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
