"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonList } from "@/components/ui/skeleton";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { Tooltip } from "@/components/ui/tooltip";
import {
  IconPlus,
  IconKey,
  IconEye,
  IconEyeOff,
  IconCopy,
  IconCheck,
  IconShare,
  IconPencil,
  IconTrash,
  IconExternalLink,
  IconX,
} from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

interface PersonRef {
  id: string;
  name: string;
  surname?: string | null;
}

interface Share {
  id: string;
  userId: string;
  user: { id: string; name: string; surname: string | null; email: string };
  sharedById: string;
  sharedBy: { id: string; name: string };
  createdAt: string;
}

interface Activity {
  id: string;
  action: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string };
}

interface EntrySummary {
  id: string;
  label: string;
  description: string | null;
  link: string | null;
  username: string | null;
  faviconDataUrl: string | null;
  departmentId: string;
  department: { id: string; name: string };
  createdById: string;
  createdBy: PersonRef;
  updatedById: string | null;
  updatedBy: PersonRef | null;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
  _count: { shares: number };
}

interface EntryDetail extends EntrySummary {
  shares: Share[];
  activities: Activity[];
}

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  shared: "Shared",
  unshared: "Access removed",
  revealed: "Revealed",
};

function personName(p: PersonRef) {
  return [p.name, p.surname].filter(Boolean).join(" ");
}

function hostnameOf(link: string | null) {
  if (!link) return null;
  try {
    return new URL(link).hostname;
  } catch {
    return link;
  }
}

export function PasswordManagerView() {
  const toast = useToast();
  const [entries, setEntries] = useState<EntrySummary[] | null>(null);
  const [me, setMe] = useState<{ id: string; isAdmin: boolean; departmentId: string | null } | null>(null);
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [openSeq, setOpenSeq] = useState(0);
  const [editing, setEditing] = useState<EntryDetail | null>(null);
  const [shareTarget, setShareTarget] = useState<EntryDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntrySummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [entriesRes, meRes] = await Promise.all([fetch("/api/passwords"), fetch("/api/auth/me")]);
      const [entriesData, meData] = await Promise.all([entriesRes.json().catch(() => ({})), meRes.json().catch(() => ({}))]);
      if (entriesRes.ok) setEntries(entriesData.entries ?? []);
      else {
        toast.error("Couldn't load passwords", entriesData.error);
        setEntries([]);
      }
      if (meRes.ok && meData.user) {
        setMe({
          id: meData.user.id,
          isAdmin: meData.user.role === "SUPER_ADMIN" || meData.user.role === "ADMIN",
          departmentId: meData.user.departmentId ?? null,
        });
      }
    } catch {
      toast.error("Couldn't load passwords", "Check your connection and try again.");
      setEntries([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    fetch("/api/users/assignable?scope=all&minimal=1")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
    fetch("/api/departments")
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
      .catch(() => {});
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !entries) return entries ?? [];
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        (e.link ?? "").toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.username ?? "").toLowerCase().includes(q)
    );
  }, [entries, query]);

  function openCreate() {
    setEditing(null);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  async function openEdit(summary: EntrySummary) {
    const res = await fetch(`/api/passwords/${summary.id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't load this entry", data.error);
    setEditing(data.entry);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  async function openShare(summary: EntrySummary) {
    const res = await fetch(`/api/passwords/${summary.id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't load this entry", data.error);
    setShareTarget(data.entry);
  }

  async function remove() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/passwords/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return toast.error("Couldn't delete this entry", data.error);
    }
    toast.success("Entry deleted");
    setDeleteTarget(null);
    load();
  }

  async function removeMyAccess(entry: EntrySummary) {
    if (!me) return;
    const res = await fetch(`/api/passwords/${entry.id}/shares/${me.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove access");
    toast.success("Removed from your list");
    load();
  }

  function actionsFor(entry: EntrySummary): RowAction[] {
    if (entry.canManage) {
      return [
        { key: "edit", label: "Edit", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => openEdit(entry) },
        { key: "share", label: "Share", icon: <IconShare className="h-3.5 w-3.5" />, onSelect: () => openShare(entry) },
        { key: "delete", label: "Delete", icon: <IconTrash className="h-3.5 w-3.5" />, destructive: true, onSelect: () => setDeleteTarget(entry) },
      ];
    }
    // Visible here only via a share (own-department entries are always
    // manageable) — the one thing they can do is remove their own access.
    return [
      { key: "leave", label: "Remove my access", icon: <IconX className="h-3.5 w-3.5" />, destructive: true, onSelect: () => removeMyAccess(entry) },
    ];
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Password Manager</h1>
          <p className="text-sm text-muted-foreground">
            Shared credentials for your department — share a specific one with anyone else if they need it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {entries && entries.length > 0 && (
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="w-48" />
          )}
          <Tooltip label="Add source">
            <Button type="button" size="icon" aria-label="Add source" onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {entries === null ? (
        <div className="flex min-h-[40vh] flex-1 items-center justify-center">
          <SkeletonList rows={4} />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
            <Button type="button" variant="outline" onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
              Add your first source
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isAdmin={me?.isAdmin ?? false}
              actions={actionsFor(entry)}
              onOpen={() => openEdit(entry)}
            />
          ))}
        </div>
      )}

      <PasswordEntryDialog
        key={openSeq}
        open={dialogOpen}
        entry={editing}
        isAdmin={me?.isAdmin ?? false}
        hasOwnDepartment={!!me?.departmentId}
        departments={departments}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          load();
        }}
      />

      <ShareDialog
        entry={shareTarget}
        users={users}
        meId={me?.id ?? null}
        onClose={() => setShareTarget(null)}
        onChanged={(shares) => {
          setShareTarget((prev) => (prev ? { ...prev, shares, _count: { shares: shares.length } } : prev));
          load();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.label}"?`}
        description="This permanently removes the credential and everyone's access to it — including anyone it was shared with."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}

function EntryCard({
  entry,
  isAdmin,
  actions,
  onOpen,
}: {
  entry: EntrySummary;
  isAdmin: boolean;
  actions: RowAction[];
  onOpen: () => void;
}) {
  const toast = useToast();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  async function ensureRevealed(): Promise<string | null> {
    if (revealed) return revealed;
    setRevealing(true);
    try {
      const res = await fetch(`/api/passwords/${entry.id}/reveal`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't reveal password", data.error);
        return null;
      }
      setRevealed(data.password);
      return data.password;
    } finally {
      setRevealing(false);
    }
  }

  async function toggleReveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    await ensureRevealed();
  }

  async function copy() {
    const value = await ensureRevealed();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  const host = hostnameOf(entry.link);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-2.5 text-left">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {entry.faviconDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.faviconDataUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <IconKey className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{entry.label}</span>
            {host && <span className="block truncate text-xs text-muted-foreground">{host}</span>}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {isAdmin && <Badge variant="secondary">{entry.department.name}</Badge>}
          {actions.length > 0 && <RowActionsMenu actions={actions} label={`Actions for ${entry.label}`} />}
        </div>
      </div>

      {entry.description && <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>}

      {entry.username && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Username</span>
          <span className="truncate font-medium">{entry.username}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
        <span className={cn("min-w-0 flex-1 truncate font-mono text-xs", !revealed && "tracking-widest text-muted-foreground")}>
          {revealed ?? "••••••••••"}
        </span>
        <Tooltip label={revealed ? "Hide" : "Reveal"}>
          <button
            type="button"
            aria-label={revealed ? "Hide password" : "Reveal password"}
            disabled={revealing}
            onClick={toggleReveal}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-primary/5 hover:text-foreground"
          >
            {revealed ? <IconEyeOff className="h-3.5 w-3.5" /> : <IconEye className="h-3.5 w-3.5" />}
          </button>
        </Tooltip>
        <Tooltip label={copied ? "Copied" : "Copy"}>
          <button
            type="button"
            aria-label="Copy password"
            disabled={revealing}
            onClick={copy}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-primary/5 hover:text-foreground"
          >
            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
              <IconCopy
                className={cn(
                  "absolute h-3.5 w-3.5 transition-all duration-200",
                  copied ? "scale-50 opacity-0" : "scale-100 opacity-100"
                )}
              />
              <IconCheck
                className={cn(
                  "absolute h-3.5 w-3.5 text-emerald-500 transition-all duration-200",
                  copied ? "scale-100 opacity-100" : "scale-50 opacity-0"
                )}
              />
            </span>
          </button>
        </Tooltip>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          Added by {personName(entry.createdBy)} · {new Date(entry.createdAt).toLocaleDateString()}
        </span>
        {entry._count.shares > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            <IconShare className="h-3 w-3" />
            {entry._count.shares}
          </span>
        )}
      </div>
      {entry.updatedBy && entry.updatedById !== entry.createdById && (
        <p className="-mt-2 text-[11px] text-muted-foreground">
          Last edited by {personName(entry.updatedBy)} · {new Date(entry.updatedAt).toLocaleDateString()}
        </p>
      )}
    </Card>
  );
}

function PasswordEntryDialog({
  open,
  entry,
  isAdmin,
  hasOwnDepartment,
  departments,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: EntryDetail | null;
  isAdmin: boolean;
  hasOwnDepartment: boolean;
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editingId = entry?.id ?? null;
  const readOnly = !!entry && !entry.canManage;
  const showDepartmentPicker = isAdmin || !hasOwnDepartment;

  const [label, setLabel] = useState(entry?.label ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [link, setLink] = useState(entry?.link ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [departmentId, setDepartmentId] = useState(entry?.departmentId ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const linkPreviewHost = hostnameOf(link);

  async function save() {
    if (!label.trim()) return toast.error("Label is required");
    if (!editingId && !password) return toast.error("A password is required");
    if (showDepartmentPicker && !departmentId) return toast.error("Choose a department");
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        label: label.trim(),
        description: description.trim() || null,
        link: link.trim() || null,
        username: username.trim() || null,
      };
      if (password) body.password = password;
      if (showDepartmentPicker) body.departmentId = departmentId;

      const res = await fetch(editingId ? `/api/passwords/${editingId}` : "/api/passwords", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // A 500 from an unhandled server error (rather than a JSON error body)
      // has no body at all — .json() would throw and silently swallow the
      // failure with no toast shown, which is exactly what made this look
      // like nothing happened at all.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save", data.error ?? "Something went wrong");
      toast.success(editingId ? "Entry updated" : "Entry added");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/passwords/${editingId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return toast.error("Couldn't delete", data.error);
      }
      toast.success("Entry deleted");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editingId ? (readOnly ? "Source details" : "Edit source") : "Add source"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-label">Label</Label>
              <Input id="pw-label" value={label} disabled={readOnly} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hosting panel" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-link">Link</Label>
              <div className="flex items-center gap-2">
                {linkPreviewHost && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-input bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(linkPreviewHost)}`}
                      alt=""
                      className="h-5 w-5 object-contain"
                    />
                  </span>
                )}
                <Input
                  id="pw-link"
                  value={link}
                  disabled={readOnly}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://…"
                  className="flex-1"
                />
                {link.trim() && (
                  <a href={link.trim()} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <IconExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-desc">Description</Label>
              <Textarea id="pw-desc" value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What's this for?" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-username">Username / email</Label>
              <Input id="pw-username" value={username} disabled={readOnly} onChange={(e) => setUsername(e.target.value)} placeholder="Optional" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-password">{editingId ? "New password" : "Password"}</Label>
              <div className="relative">
                <Input
                  id="pw-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  disabled={readOnly}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingId ? "Leave blank to keep the current password" : ""}
                  className="pr-9"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide" : "Show"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {showDepartmentPicker && (
              <div className="flex flex-col gap-1.5">
                <Label>Department</Label>
                <Dropdown value={departmentId} onChange={setDepartmentId} options={departmentOptions} placeholder="Choose a department" disabled={readOnly} />
                <p className="text-xs text-muted-foreground">Only this department&apos;s users see it by default — share it to reach anyone else.</p>
              </div>
            )}

            {entry && entry.activities.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Activity</Label>
                <div className="max-h-36 overflow-y-auto rounded-md border border-border">
                  {entry.activities.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5 text-xs last:border-0">
                      <span>
                        <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>{" "}
                        <span className="text-muted-foreground">by {a.actor.name}</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        {!readOnly && (
          <DialogFooter className="justify-between">
            {editingId ? (
              <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmDelete(true)} className="text-destructive">
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={save}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Add source"}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${entry?.label}"?`}
        description="This permanently removes the credential and everyone's access to it — including anyone it was shared with."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </Dialog>
  );
}

function ShareDialog({
  entry: entryProp,
  users,
  meId,
  onClose,
  onChanged,
}: {
  entry: EntryDetail | null;
  users: PersonRef[];
  meId: string | null;
  onClose: () => void;
  onChanged: (shares: Share[]) => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setQuery("");
  }, [entryProp?.id]);

  if (!entryProp) return null;
  // A genuine const (not just a narrowed parameter) so its non-null type
  // actually flows into the nested grant()/revoke() closures below —
  // TypeScript's narrowing on a destructured parameter doesn't survive into
  // functions declared after the guard, but narrowing on a local const does.
  const entry = entryProp;

  const alreadySharedIds = new Set(entry.shares.map((s) => s.userId));
  const q = query.trim().toLowerCase();
  const candidates = users.filter(
    (u) => u.id !== entry.createdById && !alreadySharedIds.has(u.id) && (!q || personName(u).toLowerCase().includes(q))
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function grant() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/passwords/${entry.id}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't share", data.error ?? "Something went wrong");
      toast.success(`Shared with ${selected.size} ${selected.size === 1 ? "person" : "people"}`);
      setSelected(new Set());
      onChanged(data.shares);
    } finally {
      setSaving(false);
    }
  }

  async function revoke(userId: string) {
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/passwords/${entry.id}/shares/${userId}`, { method: "DELETE" });
      if (!res.ok) return toast.error("Couldn't remove access");
      onChanged(entry.shares.filter((s) => s.userId !== userId));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Share &quot;{entry.label}&quot;</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Give access to</Label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people..." />
              <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                {candidates.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No one else to add.</p>
                ) : (
                  candidates.map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0 hover:bg-primary/5">
                      <Checkbox checked={selected.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Toggle ${personName(u)}`} />
                      <span className="truncate text-sm">{personName(u)}</span>
                    </label>
                  ))
                )}
              </div>
              <Button type="button" size="sm" disabled={selected.size === 0 || saving} onClick={grant} className="self-end">
                {saving ? "Sharing..." : `Share with ${selected.size || ""}`.trim()}
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Currently shared with ({entry.shares.length})</Label>
              {entry.shares.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {entry.shares.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {personName(s.user)}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          shared by {s.sharedBy.id === meId ? "you" : s.sharedBy.name} · {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${personName(s.user)}'s access`}
                        disabled={removingId === s.userId}
                        onClick={() => revoke(s.userId)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <IconX className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
