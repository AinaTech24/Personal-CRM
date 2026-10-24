"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { IconSend, IconPencil, IconTrash, IconX, IconCheck, IconKey, IconShield, IconDownload } from "@/components/icons";
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
  surname: string | null;
  email: string;
  mobile: string | null;
  role: string;
  isActive: boolean;
  isDepartmentAdmin: boolean;
  department: { id: string; name: string } | null;
  designation: string | null;
  dateOfJoining: string | null;
}

/** Full name = name + surname, falling back to just the name. */
function fullName(u: { name: string; surname?: string | null }) {
  return [u.name, u.surname].filter(Boolean).join(" ");
}

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role.replace(/_/g, " ");
}

export default function UsersPage() {
  const toast = useToast();
  const router = useRouter();
  const { socket } = useSocket();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filter, setFilter] = useState("ALL");
  // A company Admin manages everyone; a Department Admin reaching this page
  // (see admin/users/layout.tsx) only sees their own department and can't
  // invite, change role/department/Department-Admin-status, or delete — the
  // list itself already comes back pre-scoped from the API either way.
  const [viewerIsAdmin, setViewerIsAdmin] = useState(true);

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("DEPARTMENT_USER");
  const [departmentId, setDepartmentId] = useState("");
  const [inviteIsDepartmentAdmin, setInviteIsDepartmentAdmin] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [bulkInvite, setBulkInvite] = useState(false);
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkResults, setBulkResults] = useState<{ email: string; error: string | null }[] | null>(null);

  // Edit dialog state
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState("DEPARTMENT_USER");
  const [editDept, setEditDept] = useState("");
  const [editIsDepartmentAdmin, setEditIsDepartmentAdmin] = useState(false);
  const [editDesignation, setEditDesignation] = useState("");
  const [editDateOfJoining, setEditDateOfJoining] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm state
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  // Reset PIN dialog state
  const [pinUser, setPinUser] = useState<UserRow | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  async function load() {
    const [usersRes, deptRes] = await Promise.all([fetch("/api/users"), fetch("/api/departments")]);
    const usersData = await usersRes.json().catch(() => ({}));
    const deptData = await deptRes.json().catch(() => ({}));
    if (usersRes.ok) {
      setUsers(usersData.users);
      setViewerIsAdmin(!!usersData.viewerIsAdmin);
    } else {
      toast.error("Couldn't load users", usersData.error);
    }
    if (deptRes.ok) setDepartments(deptData.departments);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live refresh when users are invited, edited, blocked, or removed anywhere.
  useEffect(() => {
    if (!socket) return;
    const events = ["user_created", "user_updated", "user_deleted"];
    const handler = () => load();
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setInviteIsDepartmentAdmin(false);
    setInviteError(null);
    setBulkInvite(false);
    setBulkEmails("");
    setBulkResults(null);
    setInviteOpen(true);
  }

  /** One invite POST, shared by the single and bulk forms — same body shape either way, just a different source for the email. */
  async function sendOneInvite(targetEmail: string): Promise<{ error: string | null; emailSent?: boolean; acceptUrl?: string }> {
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: targetEmail,
        role,
        departmentId,
        inviteeIsDepartmentAdmin: inviteIsDepartmentAdmin,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Something went wrong" };
    return { error: null, emailSent: data.emailSent, acceptUrl: data.acceptUrl };
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!departmentId) {
      setInviteError("Pick a department");
      return;
    }
    if (bulkInvite) return submitBulkInvite();
    setInviteError(null);
    setInviteLoading(true);
    try {
      const result = await sendOneInvite(email);
      if (result.error) {
        setInviteError(result.error);
        toast.error("Couldn't send invite", result.error);
        return;
      }
      setInviteOpen(false);
      if (result.emailSent === false) {
        toast.error("Invite created, but the email couldn't be sent", "Copy the link and share it manually.");
        if (result.acceptUrl) navigator.clipboard.writeText(result.acceptUrl).catch(() => {});
      } else {
        toast.success(`Invite sent to ${email}`);
      }
    } finally {
      setInviteLoading(false);
    }
  }

  /** Parses the textarea (newline/comma/semicolon separated) and sends one invite per address, sequentially so the mail server isn't hit with a burst. */
  async function submitBulkInvite() {
    const addresses = Array.from(
      new Set(
        bulkEmails
          .split(/[\n,;]+/)
          .map((e) => e.trim())
          .filter(Boolean)
      )
    );
    if (addresses.length === 0) {
      setInviteError("Paste at least one email address");
      return;
    }
    setInviteError(null);
    setInviteLoading(true);
    setBulkResults(null);
    try {
      const results: { email: string; error: string | null }[] = [];
      for (const addr of addresses) {
        const result = await sendOneInvite(addr);
        results.push({ email: addr, error: result.error });
      }
      setBulkResults(results);
      const sent = results.filter((r) => !r.error).length;
      const failed = results.length - sent;
      if (failed === 0) {
        toast.success(`Sent ${sent} invite${sent === 1 ? "" : "s"}`);
      } else {
        toast.error(`Sent ${sent}, ${failed} failed`, "See the list below for details.");
      }
    } finally {
      setInviteLoading(false);
    }
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditRole(u.role);
    setEditDept(u.department?.id ?? "");
    setEditIsDepartmentAdmin(u.isDepartmentAdmin);
    setEditDesignation(u.designation ?? "");
    setEditDateOfJoining(u.dateOfJoining ? String(u.dateOfJoining).slice(0, 10) : "");
  }

  async function saveEdit() {
    if (!editUser) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(viewerIsAdmin && {
            role: editRole,
            departmentId: editDept || null,
            isDepartmentAdmin: editIsDepartmentAdmin,
          }),
          designation: editDesignation.trim() || null,
          dateOfJoining: editDateOfJoining || null,
        }),
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

  function openResetPin(u: UserRow) {
    setPinUser(u);
    setPinValue("");
    setGeneratedPin(null);
  }

  async function submitPinChange(body: { pin?: string; clear?: boolean }) {
    if (!pinUser) return;
    setPinSaving(true);
    try {
      const res = await fetch(`/api/users/${pinUser.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't update PIN", data.error);
        return;
      }
      if (body.clear) {
        toast.success(`${pinUser.name}'s PIN cleared`);
        setPinUser(null);
      } else if (data.pin) {
        // A generated PIN — show it here so the admin can hand it over; it's
        // never emailed to them and this is the only place it's displayed.
        setGeneratedPin(data.pin);
        toast.success("PIN generated");
      } else {
        toast.success(`${pinUser.name}'s PIN updated`);
        setPinUser(null);
      }
    } finally {
      setPinSaving(false);
    }
  }

  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const exportUsersUrl = "/api/users/export";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Users &amp; Invites</h1>
          <HelpDialog title="Users & Invites — help">
            <HelpSection heading="What this page is for">
              <p>Invite new people (invite-only, restricted to @ainatech.in addresses unless an admin allows a public provider), assign their department and role, and block, edit, or delete an existing account.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>Can invite anyone, change anyone&apos;s role or department, and block/delete any account. Only a Super Admin can create or edit another Admin or Super Admin.</p>
            </HelpSection>
            <HelpSection heading="Department Admins">
              <p>Can invite and edit people within their own department, but not change their role, department, or Department Admin status, and never touch an Admin or Super Admin account.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip label="Export CSV" side="bottom">
            {/* Downloads a CSV attachment, not a page — not <Link>, same convention as admin/attendance's export button. */}
            <a href={exportUsersUrl}>
              <Button size="icon" variant="outline" aria-label="Export CSV">
                <IconDownload className="h-4 w-4" />
              </Button>
            </a>
          </Tooltip>
          {viewerIsAdmin && (
            <Button size="sm" className="gap-1.5" onClick={openInvite}>
              <IconSend className="h-4 w-4" />
            </Button>
          )}
        </div>
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
                    <tr
                      key={u.id}
                      onClick={() => router.push(`/admin/users/${u.id}`)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-primary/5"
                    >
                      <td className="px-6 py-2.5 font-medium">{fullName(u)}</td>
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
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Tooltip label="Edit">
                            <button
                              type="button"
                              aria-label="Edit user"
                              onClick={() => openEdit(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                            >
                              <IconPencil className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          <Tooltip label="Module permissions">
                            <button
                              type="button"
                              aria-label="Module permissions"
                              onClick={() => router.push(`/admin/permissions?userId=${u.id}`)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                            >
                              <IconShield className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          <Tooltip label={u.isActive ? "Block" : "Unblock"}>
                            <button
                              type="button"
                              aria-label={u.isActive ? "Block user" : "Unblock user"}
                              onClick={() => toggleBlock(u)}
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-md hover:bg-primary/5",
                                u.isActive ? "text-muted-foreground hover:text-amber-500" : "text-emerald-500"
                              )}
                            >
                              {u.isActive ? <IconX className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
                            </button>
                          </Tooltip>
                          <Tooltip label="Reset PIN">
                            <button
                              type="button"
                              aria-label="Reset PIN"
                              onClick={() => openResetPin(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                            >
                              <IconKey className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          {viewerIsAdmin && (
                            <Tooltip label="Delete">
                              <button
                                type="button"
                                aria-label="Delete user"
                                onClick={() => setDeleteUser(u)}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            </Tooltip>
                          )}
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
              <label className="flex items-center gap-2 text-sm">
                <ToggleSwitch
                  checked={bulkInvite}
                  onChange={(v) => {
                    setBulkInvite(v);
                    setBulkResults(null);
                    setInviteError(null);
                  }}
                  label="Invite multiple at once"
                />
                Invite multiple at once
              </label>
              {bulkInvite ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invite-bulk-emails">Emails</Label>
                  <Textarea
                    id="invite-bulk-emails"
                    placeholder={"One per line, or separated by commas\nname1@ainatech.in\nname2@ainatech.in"}
                    value={bulkEmails}
                    onChange={(e) => setBulkEmails(e.target.value)}
                    rows={5}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Same role and department below apply to everyone in the list.</p>
                </div>
              ) : (
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
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Dropdown id="invite-role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-department">Department</Label>
                <Dropdown
                  id="invite-department"
                  value={departmentId}
                  onChange={(v) => {
                    setDepartmentId(v);
                    // Department Admin means nothing without a department to
                    // administer — clearing it would otherwise leave the
                    // toggle checked but silently inert.
                    if (!v && inviteIsDepartmentAdmin) setInviteIsDepartmentAdmin(false);
                  }}
                  placeholder="Select a department"
                  options={deptOptions}
                />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Make Department Admin</span>
                  <span className="text-xs text-muted-foreground">
                    {departmentId
                      ? `Can open the Permission Manager for anyone else in ${departments.find((d) => d.id === departmentId)?.name ?? "this department"} and grant them module access — not for Role, Department, or making someone else a Department Admin.`
                      : "Pick a department above first — this has nothing to administer without one."}
                  </span>
                </span>
                <ToggleSwitch
                  checked={inviteIsDepartmentAdmin}
                  onChange={setInviteIsDepartmentAdmin}
                  disabled={!departmentId}
                  label="Make Department Admin"
                />
              </div>
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
              {bulkResults && (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
                  {bulkResults.map((r) => (
                    <div key={r.email} className="flex items-center justify-between gap-2">
                      <span className="truncate">{r.email}</span>
                      <span className={r.error ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                        {r.error ?? "Sent"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="invite-form" disabled={inviteLoading || !departmentId} className="gap-1.5">
              <IconSend className="h-4 w-4" />
              {inviteLoading ? "Sending..." : bulkInvite ? "Send invites" : "Send invite"}
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
                <Dropdown id="edit-role" value={editRole} onChange={setEditRole} options={ROLE_OPTIONS} disabled={!viewerIsAdmin} />
                {!viewerIsAdmin && <p className="text-xs text-muted-foreground">Only a company Admin can change this.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-dept">Department</Label>
                <Dropdown
                  id="edit-dept"
                  value={editDept}
                  onChange={(v) => {
                    setEditDept(v);
                    // Department Admin means nothing without a department to
                    // administer — clearing it would otherwise leave the
                    // checkbox checked but silently inert.
                    if (!v && editIsDepartmentAdmin) setEditIsDepartmentAdmin(false);
                  }}
                  placeholder="None"
                  options={deptOptions}
                  disabled={!viewerIsAdmin}
                />
                {!viewerIsAdmin && <p className="text-xs text-muted-foreground">Only a company Admin can change this.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-designation">Designation</Label>
                <Input
                  id="edit-designation"
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  placeholder="e.g. Software Engineer"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-doj">Date of joining</Label>
                <DatePicker
                  id="edit-doj"
                  value={editDateOfJoining}
                  onChange={setEditDateOfJoining}
                  placeholder="Pick a date"
                  yearRange={{ from: new Date().getFullYear() - 15, to: new Date().getFullYear() }}
                />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Department Admin</span>
                  <span className="text-xs text-muted-foreground">
                    {!viewerIsAdmin
                      ? "Only a company Admin can change this."
                      : editDept
                        ? `Can open the Permission Manager for anyone else in ${departments.find((d) => d.id === editDept)?.name ?? "this department"} and grant them module access — not for Role, Department, or making someone else a Department Admin.`
                        : "Pick a department above first — this has nothing to administer without one."}
                  </span>
                </span>
                <ToggleSwitch
                  checked={editIsDepartmentAdmin}
                  onChange={setEditIsDepartmentAdmin}
                  disabled={!editDept || !viewerIsAdmin}
                  label="Department Admin"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" className="mr-auto gap-1.5" onClick={() => router.push(`/admin/permissions?userId=${editUser?.id}`)}>
              <IconShield className="h-4 w-4" />
              Module permissions
            </Button>
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

      {/* Reset PIN popup */}
      <Dialog open={!!pinUser} onOpenChange={(v) => !v && setPinUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN for {pinUser?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {!pinUser?.mobile ? (
              <p className="text-sm text-muted-foreground">
                {pinUser?.name} has no mobile number on file yet — add one before setting a PIN
                (a PIN signs in with a mobile number instead of email and password).
              </p>
            ) : generatedPin ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  New PIN for {pinUser.name} — share it with them, it won&apos;t be shown again:
                </p>
                <p className="rounded-md bg-muted py-3 text-center text-2xl font-semibold tracking-[0.4em]">
                  {generatedPin}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="admin-set-pin">Set a specific PIN (optional)</Label>
                  <Input
                    id="admin-set-pin"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Leave blank to generate one"
                    value={pinValue}
                    onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {pinUser?.name} gets an email saying their PIN changed — the PIN itself is never
                  emailed, so share it with them directly.
                </p>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {pinUser?.mobile && !generatedPin && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submitPinChange({ clear: true })}
                  disabled={pinSaving}
                  className="mr-auto text-destructive hover:text-destructive"
                >
                  Clear PIN
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (pinValue && !/^\d{6}$/.test(pinValue)) {
                      toast.error("PIN must be exactly 6 digits");
                      return;
                    }
                    submitPinChange(pinValue ? { pin: pinValue } : {});
                  }}
                  disabled={pinSaving}
                >
                  {pinSaving ? "Saving..." : pinValue ? "Set PIN" : "Generate PIN"}
                </Button>
              </>
            )}
            {generatedPin && (
              <Button type="button" onClick={() => setPinUser(null)}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
