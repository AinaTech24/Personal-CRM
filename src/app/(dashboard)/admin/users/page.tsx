"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { IconSend, IconPencil, IconTrash, IconX, IconCheck } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  { value: "DEPARTMENT_USER", label: "Department User" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

const FILTER_OPTIONS = [
  { value: "ALL", label: "All users" },
  { value: "USERS", label: "Users" },
  { value: "ADMINS", label: "Admins" },
];

interface Department {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  department: { id: string; name: string } | null;
}

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role.replace(/_/g, " ");
}

export default function UsersPage() {
  const toast = useToast();
  const { socket } = useSocket();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filter, setFilter] = useState("ALL");

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("DEPARTMENT_USER");
  const [departmentId, setDepartmentId] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Edit dialog state
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState("DEPARTMENT_USER");
  const [editDept, setEditDept] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm state
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  async function load() {
    const [usersRes, deptRes] = await Promise.all([fetch("/api/users"), fetch("/api/departments")]);
    const usersData = await usersRes.json();
    const deptData = await deptRes.json();
    if (usersRes.ok) setUsers(usersData.users);
    if (deptRes.ok) setDepartments(deptData.departments);
  }

  useEffect(() => {
    load();
  }, []);

  // Live refresh when users are invited, edited, blocked, or removed anywhere.
  useEffect(() => {
    if (!socket) return;
    const events = ["user_created", "user_updated", "user_deleted"];
    const handler = () => load();
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
  }, [socket]);

  const filteredUsers = useMemo(() => {
    if (filter === "USERS") return users.filter((u) => u.role === "DEPARTMENT_USER");
    if (filter === "ADMINS") return users.filter((u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN");
    return users;
  }, [users, filter]);

  function openInvite() {
    setEmail("");
    setRole("DEPARTMENT_USER");
    setDepartmentId("");
    setInviteError(null);
    setInviteOpen(true);
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteLoading(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, departmentId: departmentId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error ?? "Something went wrong");
        toast.error("Couldn't send invite", data.error);
        return;
      }
      setInviteOpen(false);
      toast.success(`Invite sent to ${email}`);
    } finally {
      setInviteLoading(false);
    }
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditRole(u.role);
    setEditDept(u.department?.id ?? "");
  }

  async function saveEdit() {
    if (!editUser) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRole, departmentId: editDept || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't update user", data.error);
        return;
      }
      setEditUser(null);
      toast.success("User updated");
      load();
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleBlock(u: UserRow) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(u.isActive ? "Couldn't block user" : "Couldn't unblock user", data.error);
      return;
    }
    toast.success(u.isActive ? `${u.name} blocked` : `${u.name} unblocked`);
    load();
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't delete user", data.error);
      return;
    }
    toast.success(`${deleteUser.name} deleted`);
    load();
  }

  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Users &amp; Invites</h1>
          <p className="text-sm text-muted-foreground">Invite-only access, restricted to @ainatech.in addresses.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openInvite}>
          <IconSend className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4 px-6 py-3.5">
          <h2 className="text-base font-semibold">
            All users <span className="text-sm font-normal text-muted-foreground">({filteredUsers.length})</span>
          </h2>
          <div className="w-44">
            <Dropdown value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
          </div>
        </div>
        <CardContent className="p-0">
          <div className="max-h-[26rem] overflow-y-auto focus:outline-none">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-t border-border text-left text-xs text-muted-foreground">
                  <th className="px-6 py-2 font-medium">Name</th>
                  <th className="px-6 py-2 font-medium">Email</th>
                  <th className="px-6 py-2 font-medium">Role</th>
                  <th className="px-6 py-2 font-medium">Department</th>
                  <th className="px-6 py-2 font-medium">Status</th>
                  <th className="px-6 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr className="border-t border-border">
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No users to show.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-6 py-2.5">{u.name}</td>
                      <td className="px-6 py-2.5 text-muted-foreground">{u.email}</td>
                      <td className="px-6 py-2.5">{roleLabel(u.role)}</td>
                      <td className="px-6 py-2.5 text-muted-foreground">{u.department?.name ?? "—"}</td>
                      <td className="px-6 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            u.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {u.isActive ? "Active" : "Blocked"}
                        </span>
                      </td>
                      <td className="px-6 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip label="Edit">
                            <button
                              type="button"
                              aria-label="Edit user"
                              onClick={() => openEdit(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <IconPencil className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          <Tooltip label={u.isActive ? "Block" : "Unblock"}>
                            <button
                              type="button"
                              aria-label={u.isActive ? "Block user" : "Unblock user"}
                              onClick={() => toggleBlock(u)}
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent",
                                u.isActive ? "text-muted-foreground hover:text-amber-500" : "text-emerald-500"
                              )}
                            >
                              {u.isActive ? <IconX className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
                            </button>
                          </Tooltip>
                          <Tooltip label="Delete">
                            <button
                              type="button"
                              aria-label="Delete user"
                              onClick={() => setDeleteUser(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Send invite popup */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send invite</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="invite-form" onSubmit={submitInvite} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="name@ainatech.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Dropdown id="invite-role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-department">Department (optional)</Label>
                <Dropdown
                  id="invite-department"
                  value={departmentId}
                  onChange={setDepartmentId}
                  placeholder="None"
                  options={deptOptions}
                />
              </div>
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="invite-form" disabled={inviteLoading} className="gap-1.5">
              <IconSend className="h-4 w-4" />
              {inviteLoading ? "Sending..." : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user popup */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editUser?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input value={editUser?.email ?? ""} disabled />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-role">Role</Label>
                <Dropdown id="edit-role" value={editRole} onChange={setEditRole} options={ROLE_OPTIONS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-dept">Department</Label>
                <Dropdown
                  id="edit-dept"
                  value={editDept}
                  onChange={setEditDept}
                  placeholder="None"
                  options={deptOptions}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteUser}
        onOpenChange={(v) => !v && setDeleteUser(null)}
        title={`Delete ${deleteUser?.name}?`}
        description="This permanently removes the user account. Users who own records cannot be deleted — block them instead."
        onConfirm={confirmDelete}
      />
    </div>
  );
}
