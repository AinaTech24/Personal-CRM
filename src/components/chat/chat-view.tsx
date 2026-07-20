"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EightDotsRotate } from "@/components/ui/loader";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { IconPlus, IconSend, IconUsers, IconChevronLeft } from "@/components/icons";
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
}

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");
const initial = (t: string) => (t.trim()[0] ?? "?").toUpperCase();
const fmtTime = (s: string) => format(parseISO(s), "h:mm a");
const fmtWhen = (s: string) => (isToday(parseISO(s)) ? fmtTime(s) : format(parseISO(s), "MMM d"));

export function ChatView() {
  const { socket } = useSocket();
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState<{ id: string; isAdmin: boolean }>({ id: "", isAdmin: false });
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);

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
      if (meRes.user) setMe({ id: meRes.user.id, isAdmin: meRes.user.role === "SUPER_ADMIN" || meRes.user.role === "ADMIN" });
      setUsers(u.users ?? []);
      setLoading(false);
    });
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setLoadingThread(true);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      const data = await res.json().catch(() => ({ messages: [] }));
      setMessages(data.messages ?? []);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // Scroll to newest whenever messages change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const appendMessage = useCallback((m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Real-time: new messages + newly-created conversations.
  useEffect(() => {
    if (!socket) return;
    const onMessage = (payload: { conversationId: string; message: Message }) => {
      const { conversationId, message } = payload;
      if (conversationId === activeIdRef.current) appendMessage(message);
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
          lastMessage: { body: message.body, senderName: message.sender.name, createdAt: message.createdAt },
          updatedAt: message.createdAt,
          unread: isActive || message.senderId === me.id ? 0 : conv.unread + 1,
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest].sort((a, b) => Number(b.isSystem) - Number(a.isSystem));
      });
    };
    const onConversation = () => loadConversations();
    socket.on("message", onMessage);
    socket.on("conversation", onConversation);
    return () => {
      socket.off("message", onMessage);
      socket.off("conversation", onConversation);
    };
  }, [socket, appendMessage, loadConversations, me.id]);

  async function send() {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't send", data.error);
        setDraft(text);
        return;
      }
      appendMessage(data.message);
    } finally {
      setSending(false);
    }
  }

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

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
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                  activeId === c.id && "bg-accent/60"
                )}
              >
                <Avatar title={c.title} group={c.type === "GROUP"} />
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
            ))
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
              <Avatar title={active.title} group={active.type === "GROUP"} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{active.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {active.type === "GROUP" ? `${active.members.length} members` : "Direct message"}
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
                messages.map((m) => {
                  const mine = m.senderId === me.id;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {!mine && active.type === "GROUP" && (
                          <p className="mb-0.5 text-[11px] font-medium opacity-70">{fullName(m.sender)}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={cn("mt-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{fmtTime(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Type a message…"
              />
              <Button type="button" onClick={send} disabled={sending || !draft.trim()} size="sm">
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

function Avatar({ title, group }: { title: string; group: boolean }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {group ? <IconUsers className="h-5 w-5" /> : initial(title)}
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
                  className={cn(
                    "flex-1 rounded px-3 py-1.5 text-sm capitalize transition-colors",
                    mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {m === "direct" ? "Direct message" : "Group"}
                </button>
              ))}
            </div>
          )}

          {mode === "group" && isAdmin && (
            <div className="mb-3 flex flex-col gap-1.5">
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
      {user.role && <span className="block truncate text-xs text-muted-foreground">{user.role.replace(/_/g, " ").toLowerCase()}</span>}
    </span>
  );
}
