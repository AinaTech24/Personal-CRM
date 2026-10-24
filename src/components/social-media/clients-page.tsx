"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonCards } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import {
  IconPlus,
  IconTrash,
  IconPencil,
  IconSearch,
  IconX,
  IconArrowsUpDown,
  IconLayoutGrid,
  IconCheck,
} from "@/components/icons";
import { LottieIcon } from "@/components/icons/lottie-icon";
import { Dropdown } from "@/components/ui/dropdown";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { useSocket } from "@/components/providers/socket-provider";
import { userOptionLabel } from "@/lib/user-display";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  ENQUIRY: "Enquiry",
  CALLING: "Calling",
  MEETING: "Meeting",
  PLAN_DISCUSSION: "Plan Discussion",
  APPROVAL: "Approval",
  ONBOARDED: "Onboarded",
};

const STAGE_ORDER = Object.keys(STAGE_LABELS);

const SORT_OPTIONS = [
  { value: "custom", label: "Custom order" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "stage", label: "Stage" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "custom", label: "Custom" },
];

/** icon px, card min-width px */
const SIZE_PRESETS: Record<string, { icon: number; card: number }> = {
  small: { icon: 28, card: 96 },
  medium: { icon: 48, card: 128 },
  large: { icon: 72, card: 168 },
};

const SORT_STORAGE_KEY = "aina-clients-sort";
const SIZE_STORAGE_KEY = "aina-clients-icon-size";

interface ClientRow {
  id: string;
  name: string;
  companyName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  planNotes: string | null;
  assignedTo: { id: string; name: string } | null;
  assignedToId?: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  folderOrder: number;
  _count: { contentItems: number; adCampaigns: number };
}

interface AssignableUser {
  id: string;
  name: string;
  surname?: string | null;
  role?: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER" | null;
}

interface ClientFormState {
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  planNotes: string;
  assignedToId: string;
}

const EMPTY_FORM: ClientFormState = {
  name: "",
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  planNotes: "",
  assignedToId: "",
};

/**
 * An icon-only trigger (no visible label) that opens a text menu of
 * options — same behavior as the shared Dropdown, just a compact button
 * instead of a full labeled field, for header controls like sort/size.
 */
function IconOnlyDropdown({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Extra content rendered below the option list, e.g. a slider for "Custom". */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <span>
          <Tooltip label={label}>
            <button
              type="button"
              aria-label={label}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground",
                open && "border-ring/50 text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          </Tooltip>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                if (opt.value !== "custom") setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-primary/5",
                opt.value === value && "bg-accent/60"
              )}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          ))}
          {footer}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Social Media's own view of the same client records the "Social Media"
 * admin page manages — folder-style cards instead of a data table, matching
 * the Leads module's layout (title/count, a "+ New" action), plus
 * drag-to-reorder, sorting, icon size, and the global top-bar search. Same
 * /api/social/clients data, same detail page, just a different presentation
 * for the team living in this module day to day.
 */
export function ClientsPageClient() {
  const toast = useToast();
  const router = useRouter();
  const { socket } = useSocket();
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [isLead, setIsLead] = useState(false);
  const [loading, setLoading] = useState(true);

  const [sortMode, setSortMode] = useState("custom");
  const [sizeMode, setSizeMode] = useState("medium");
  const [customSize, setCustomSize] = useState(48);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ClientFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Which folder card's Lottie icon is currently animating — hover-to-play,
  // same convention as the sidebar's own nav icons.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Personal display preferences — remembered per browser, not shared with the team.
  useEffect(() => {
    const savedSort = localStorage.getItem(SORT_STORAGE_KEY);
    if (savedSort) setSortMode(savedSort);
    const savedSize = localStorage.getItem(SIZE_STORAGE_KEY);
    if (savedSize) {
      try {
        const parsed = JSON.parse(savedSize);
        if (parsed.mode) setSizeMode(parsed.mode);
        if (parsed.customPx) setCustomSize(parsed.customPx);
      } catch {
        // ignore corrupt/old value
      }
    }
  }, []);

  function changeSort(mode: string) {
    setSortMode(mode);
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  }

  function changeSizeMode(mode: string) {
    setSizeMode(mode);
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify({ mode, customPx: customSize }));
  }

  function changeCustomSize(px: number) {
    setCustomSize(px);
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify({ mode: "custom", customPx: px }));
  }

  async function load() {
    setLoading(true);
    try {
      const [clientsRes, usersRes, meRes] = await Promise.all([
        fetch("/api/social/clients"),
        // minimal=1: this page only shows names in the "Assigned to" dropdown,
        // never avatar thumbnails — see assignableUsersFor's comment.
        fetch("/api/users/assignable?scope=all&minimal=1"),
        fetch("/api/auth/me"),
      ]);
      const [clientsData, usersData, meData] = await Promise.all([clientsRes.json(), usersRes.json(), meRes.json()]);
      if (clientsRes.ok) setClients(clientsData.clients);
      if (usersRes.ok) setAssignableUsers(usersData.users);
      if (meRes.ok) setIsLead(!!meData.user?.socialMedia?.isLead);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const events = ["social_client_created", "social_client_updated", "social_client_deleted"];
    const handler = () => load();
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
  }, [socket]);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.companyName, c.contactPerson, c.email].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
    );
  }, [clients, query]);

  const sortedClients = useMemo(() => {
    const arr = [...filteredClients];
    switch (sortMode) {
      case "name_asc":
        return arr.sort((a, b) => a.name.localeCompare(b.name));
      case "name_desc":
        return arr.sort((a, b) => b.name.localeCompare(a.name));
      case "stage":
        return arr.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
      case "newest":
        return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case "oldest":
        return arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "custom":
      default:
        return arr.sort((a, b) => a.folderOrder - b.folderOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
  }, [filteredClients, sortMode]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function openEdit(client: ClientRow) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      companyName: client.companyName ?? "",
      contactPerson: client.contactPerson ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      planNotes: client.planNotes ?? "",
      assignedToId: client.assignedTo?.id ?? "",
    });
    setCreateOpen(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        companyName: form.companyName || null,
        contactPerson: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        planNotes: form.planNotes || null,
        assignedToId: form.assignedToId || null,
      };
      const res = editingId
        ? await fetch(`/api/social/clients/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/social/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) return toast.error(editingId ? "Couldn't update client" : "Couldn't create client", data.error);
      setCreateOpen(false);
      toast.success(editingId ? "Client updated" : "Client created", form.name);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/social/clients/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't delete client", data.error);
      return;
    }
    toast.success(`${deleteTarget.name} deleted`);
    load();
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const order = sortedClients.map((c) => c.id);
    const fromIdx = order.indexOf(draggingId);
    const toIdx = order.indexOf(targetId);
    setDraggingId(null);
    setDragOverId(null);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...order];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggingId);

    // Dragging is a manual arrangement — switch to "Custom order" so it visibly sticks.
    changeSort("custom");
    setClients((prev) =>
      prev.map((c) => {
        const idx = reordered.indexOf(c.id);
        return idx === -1 ? c : { ...c, folderOrder: idx };
      })
    );
    fetch("/api/social/clients/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered }),
    }).catch(() => toast.error("Couldn't save the new order"));
  }

  const userOptions = assignableUsers.map((u) => ({ value: u.id, label: userOptionLabel(u) }));
  const iconPx = sizeMode === "custom" ? customSize : SIZE_PRESETS[sizeMode].icon;
  const cardPx = sizeMode === "custom" ? Math.round(customSize * 2.2) : SIZE_PRESETS[sizeMode].card;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Clients</h1>
          <HelpDialog title="Clients — help">
            <HelpSection heading="What this page is for">
              <p>The Social Media module&apos;s own client directory — platforms, credentials, content folders, ad accounts, and monthly reports for each client you manage.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins and Social Media Team leads">
              <p>See and manage every client.</p>
            </HelpSection>
            <HelpSection heading="Department Admins & Permission Manager grants">
              <p>See and manage clients only where explicitly granted (Permission Manager → Clients) — their own department by default, or every department if a company Admin turned on &quot;All departments&quot; for them.</p>
            </HelpSection>
            <HelpSection heading="Everyone else on the Social Media team">
              <p>You see clients you&apos;re assigned to.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients..."
              className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <IconOnlyDropdown icon={IconArrowsUpDown} label="Sort" value={sortMode} onChange={changeSort} options={SORT_OPTIONS} />
          <IconOnlyDropdown
            icon={IconLayoutGrid}
            label="Icon size"
            value={sizeMode}
            onChange={changeSizeMode}
            options={SIZE_OPTIONS}
            footer={
              sizeMode === "custom" ? (
                <div className="px-2 pb-1 pt-2">
                  <input
                    type="range"
                    min={24}
                    max={120}
                    value={customSize}
                    onChange={(e) => changeCustomSize(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label="Folder icon size"
                  />
                </div>
              ) : null
            }
          />
          <Tooltip label="New client">
            <Button size="icon" aria-label="New client" onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {loading ? (
        // Without this, the grid was just empty during the fetch — reading as
        // a stall rather than a page that's actively loading.
        <SkeletonCards count={8} />
      ) : (
        <>
          {filteredClients.length === 0 && (
            <Card>
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {clients.length === 0 ? "No clients yet. Add the first one to start the onboarding flow." : "No clients match your search."}
              </div>
            </Card>
          )}

          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardPx}px, 1fr))` }}
          >
            {sortedClients.map((client) => (
              <Card
                key={client.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", client.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingId(client.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(client.id);
                }}
                onDragLeave={() => setDragOverId((id) => (id === client.id ? null : id))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(client.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onMouseEnter={() => setHoveredId(client.id)}
                onMouseLeave={() => setHoveredId((id) => (id === client.id ? null : id))}
                onClick={() => router.push(`/social-media/${client.id}`)}
                className={cn(
                  "group relative cursor-grab select-none p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:cursor-grabbing",
                  draggingId === client.id && "opacity-30",
                  dragOverId === client.id && draggingId !== client.id && "border-primary/60 bg-accent/40"
                )}
              >
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Tooltip label="Edit">
                    <button
                      type="button"
                      aria-label={`Edit ${client.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(client);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    >
                      <IconPencil className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  {isLead && (
                    <Tooltip label="Delete">
                      <button
                        type="button"
                        aria-label={`Delete ${client.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(client);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  )}
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                  <LottieIcon
                    src="/icons/Folder.json"
                    size={iconPx}
                    className="shrink-0"
                    colorClassName="text-primary/70"
                    playing={hoveredId === client.id}
                  />
                  <div className="min-w-0 w-full">
                    <p className="truncate text-sm font-medium">{client.name}</p>
                    {client.companyName && (
                      <p className="truncate text-xs text-muted-foreground">{client.companyName}</p>
                    )}
                  </div>
                  <Badge variant="secondary">{STAGE_LABELS[client.stage] ?? client.stage}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit client" : "New client"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="client-form" onSubmit={submitForm} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client-name">Name</Label>
                <Input id="client-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client-company">Company</Label>
                <Input id="client-company" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-contact">Contact person</Label>
                  <Input id="client-contact" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-phone">Phone</Label>
                  <Input id="client-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client-email">Email</Label>
                <Input id="client-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client-assigned">Assigned to</Label>
                <Dropdown
                  id="client-assigned"
                  value={form.assignedToId}
                  onChange={(v) => setForm((f) => ({ ...f, assignedToId: v }))}
                  placeholder="Unassigned"
                  options={userOptions}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client-notes">Plan notes</Label>
                <Textarea id="client-notes" value={form.planNotes} onChange={(e) => setForm((f) => ({ ...f, planNotes: e.target.value }))} rows={3} />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="client-form" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        description="This permanently removes the client along with its platform accounts, content, ad campaigns, and reports. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </div>
  );
}
