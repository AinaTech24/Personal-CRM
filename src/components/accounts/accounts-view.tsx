"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { SkeletonList } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { IconPlus, IconPencil, IconTrash, IconX } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

type ClientStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "LOST";

interface ClientUser {
  id: string;
  name: string;
}

interface ClientProject {
  id: string;
  name: string;
}

interface ClientDepartment {
  id: string;
  name: string;
}

interface ClientRecord {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  notes: string | null;
  department: ClientDepartment | null;
  assignedTo: ClientUser | null;
  createdBy: ClientUser;
  projects: ClientProject[];
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "LOST", label: "Lost" },
];

const STATUS_STYLE: Record<ClientStatus, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  ON_HOLD: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  LOST: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function AccountsView() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [departments, setDepartments] = useState<ClientDepartment[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openSeq, setOpenSeq] = useState(0);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, uRes, pRes, meRes] = await Promise.all([
        fetch("/api/clients"),
        fetch("/api/users/assignable?scope=all"),
        fetch("/api/projects"),
        fetch("/api/auth/me"),
      ]);
      const [cData, uData, pData, meData] = await Promise.all([cRes.json(), uRes.json(), pRes.json(), meRes.json()]);
      setClients(cData.clients ?? []);
      setUsers(uData.users ?? []);
      setProjects((pData.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      const admin = meRes.ok && (meData.user?.role === "SUPER_ADMIN" || meData.user?.role === "ADMIN");
      setIsAdmin(!!admin);
      if (meRes.ok) setMeId(meData.user?.id ?? "");
      if (admin) {
        const deptRes = await fetch("/api/departments");
        const deptData = await deptRes.json();
        if (deptRes.ok) setDepartments(deptData.departments);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  function openClient(c: ClientRecord) {
    setEditing(c);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  function clientActions(c: ClientRecord): RowAction[] {
    return [
      { key: "edit", label: "Edit", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => openClient(c) },
      {
        key: "delete",
        label: "Delete",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        destructive: true,
        onSelect: () => setDeleteTarget(c),
      },
    ];
  }

  async function deleteClient(id: string) {
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="text-sm text-muted-foreground">Clients your department works with, linked to their projects.</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <IconPlus className="h-4 w-4" />
          Add account
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center min-h-[40vh] flex-1 items-center">
          <SkeletonList rows={5} />
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">No accounts yet.</p>
            <Button type="button" variant="outline" onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
              Add your first account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Projects</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="group cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5"
                    onClick={() => openClient(c)}
                  >
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.company || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[c.status])}>
                        {STATUS_OPTIONS.find((s) => s.value === c.status)?.label ?? c.status}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">
                      {c.projects.length > 0 ? c.projects.map((p) => p.name).join(", ") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {c.assignedTo ? (c.assignedTo.id === meId ? "You" : c.assignedTo.name) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      {format(parseISO(c.updatedAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <RowActionsMenu actions={clientActions(c)} label={`Actions for ${c.name}`} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AccountDialog
        key={openSeq}
        open={dialogOpen}
        client={editing}
        users={users}
        projects={projects}
        departments={departments}
        isAdmin={isAdmin}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          load();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete this account?"
        description="This permanently removes the client record."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) await deleteClient(deleteTarget.id);
        }}
      />
    </div>
  );
}

function AccountDialog({
  open,
  client,
  users,
  projects,
  departments,
  isAdmin,
  onClose,
  onSaved,
}: {
  open: boolean;
  client: ClientRecord | null;
  users: ClientUser[];
  projects: ClientProject[];
  departments: ClientDepartment[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editingId = client?.id ?? null;

  const [name, setName] = useState(client?.name ?? "");
  const [company, setCompany] = useState(client?.company ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? "ACTIVE");
  const [assignedToId, setAssignedToId] = useState(client?.assignedTo?.id ?? "");
  const [departmentId, setDepartmentId] = useState(client?.department?.id ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(client?.projects.map((p) => p.id) ?? []);
  const [projectToAdd, setProjectToAdd] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assigneeOptions = [{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))];
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const projectOptions = projects.filter((p) => !projectIds.includes(p.id)).map((p) => ({ value: p.id, label: p.name }));

  function addProject() {
    if (!projectToAdd || projectIds.includes(projectToAdd)) return;
    setProjectIds((prev) => [...prev, projectToAdd]);
    setProjectToAdd("");
  }

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        status,
        notes: notes.trim() || null,
        assignedToId: assignedToId || null,
        ...(isAdmin ? { departmentId: departmentId || null } : {}),
        projectIds,
      };
      const res = await fetch(editingId ? `/api/clients/${editingId}` : "/api/clients", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save the account", data.error);
      toast.success(editingId ? "Account updated" : "Account added");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${editingId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return toast.error("Couldn't delete the account", data.error);
      }
      toast.success("Account deleted");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-name">Name</Label>
                <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client or company contact" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-company">Company</Label>
                <Input id="account-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-email">Email</Label>
                <Input id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-phone">Phone</Label>
                <Input id="account-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Dropdown value={status} onChange={(v) => setStatus(v as ClientStatus)} options={STATUS_OPTIONS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Owner</Label>
                <Dropdown value={assignedToId} onChange={setAssignedToId} options={assigneeOptions} placeholder="Unassigned" />
              </div>
            </div>

            {isAdmin && (
              <div className="flex flex-col gap-1.5">
                <Label>Department</Label>
                <Dropdown value={departmentId} onChange={setDepartmentId} options={departmentOptions} placeholder="No department" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Linked projects</Label>
              <div className="flex gap-2">
                <Dropdown value={projectToAdd} onChange={setProjectToAdd} options={projectOptions} placeholder="Select a project" />
                <Button type="button" size="sm" variant="outline" onClick={addProject} className="shrink-0">
                  Add
                </Button>
              </div>
              {projectIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {projectIds.map((id) => {
                    const p = projects.find((pr) => pr.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs">
                        {p?.name ?? id}
                        <button
                          type="button"
                          onClick={() => setProjectIds((prev) => prev.filter((pid) => pid !== id))}
                          aria-label={`Remove ${p?.name}`}
                        >
                          <IconX className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-notes">Notes</Label>
              <Textarea id="account-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything worth remembering about this client" />
            </div>
          </div>
        </DialogBody>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
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
              {saving ? "Saving..." : editingId ? "Save changes" : "Add account"}
            </Button>
          </div>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this account?"
        description="This permanently removes the client record."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </Dialog>
  );
}
