"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { SkeletonForm } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconPencil, IconTrash, IconSend, IconCheck, IconX, IconPlus } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";
import { ClientPipeline } from "@/components/social-media/client-pipeline";
import { StatusBadge } from "@/components/attendance/status-badge";
import { HALF_DAY_REASON_LABEL, STATUS_LABEL } from "@/lib/attendance-ui";
import { LeadsBoard } from "@/components/leads/leads-board";
import { TasksBoard } from "@/components/tasks/tasks-board";
import { MeetingsView } from "@/components/meetings/meetings-view";
import { ProjectsList } from "@/components/projects/projects-list";
import { LeaveAdminView } from "@/components/leave/leave-admin-view";

type TabKey = "members" | "pipeline" | "leads" | "tasks" | "meetings" | "projects" | "attendance" | "leave" | "activity";

const TABS: { key: TabKey; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "pipeline", label: "Pipeline" },
  { key: "leads", label: "Leads" },
  { key: "tasks", label: "Tasks" },
  { key: "meetings", label: "Meetings" },
  { key: "projects", label: "Projects" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "activity", label: "Activity" },
];

interface Member {
  userId: string;
  isLead: boolean;
  user: { id: string; name: string; surname: string | null; email: string };
}

interface Candidate {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  role: string;
}

const MEMBER_ROLE_OPTIONS = [
  { value: "MEMBER", label: "Social Media User" },
  { value: "ADMIN", label: "Social Media (Admin)" },
];

/**
 * Team console for the Social Media module — reachable by a company Admin
 * (via the admin nav) or by the team's own lead (via their own nav). The
 * page.tsx wrapping this already turned away anyone who isn't a lead/admin
 * server-side before this ever mounts; the `forbidden` fallback below is a
 * second line of defense against the underlying APIs themselves, not the
 * primary gate.
 */
export function SocialMediaTeamConsole() {
  const [tab, setTab] = useState<TabKey>("members");
  const [forbidden, setForbidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Social Media Team</h1>
          <p className="text-sm text-muted-foreground">
            Manage who&apos;s on the team, and see their attendance and activity across the whole CRM — scoped to
            this team only.
          </p>
        </div>
        {tab === "members" && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip label="Add member" side="bottom">
              <Button size="icon" variant="outline" onClick={() => setAddOpen(true)} aria-label="Add member">
                <IconPlus className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip label="Invite new user" side="bottom">
              <Button size="icon" variant="outline" onClick={() => setInviteOpen(true)} aria-label="Invite new user">
                <IconSend className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {forbidden ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            You don&apos;t have access to the Social Media team console.
          </CardContent>
        </Card>
      ) : (
        <>
          {tab === "members" && (
            <MembersTab
              onForbidden={() => setForbidden(true)}
              addOpen={addOpen}
              setAddOpen={setAddOpen}
              inviteOpen={inviteOpen}
              setInviteOpen={setInviteOpen}
            />
          )}
          {tab === "pipeline" && <ClientPipeline />}
          {tab === "leads" && <LeadsBoard scope="social-media" />}
          {tab === "tasks" && <TasksBoard scope="social-media" />}
          {tab === "meetings" && <MeetingsView scope="social-media" />}
          {tab === "projects" && <ProjectsList scope="social-media" />}
          {tab === "attendance" && <AttendanceTab />}
          {tab === "leave" && <LeaveAdminView canEditDelete={false} />}
          {tab === "activity" && <ActivityTab />}
        </>
      )}
    </div>
  );
}

// ---------- Members ----------

function MembersTab({
  onForbidden,
  addOpen,
  setAddOpen,
  inviteOpen,
  setInviteOpen,
}: {
  onForbidden: () => void;
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
  inviteOpen: boolean;
  setInviteOpen: (v: boolean) => void;
}) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState("MEMBER");
  const [editSaving, setEditSaving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);

  // Reset each dialog's own transient state whenever the header icon opens it.
  useEffect(() => {
    if (addOpen) setQuery("");
  }, [addOpen]);
  useEffect(() => {
    if (inviteOpen) {
      setInviteEmail("");
      setInviteRole("MEMBER");
      setInviteError(null);
    }
  }, [inviteOpen]);

  const load = useCallback(async () => {
    const [membersRes, candidatesRes] = await Promise.all([fetch("/api/social/members"), fetch("/api/social/team-candidates")]);
    if (membersRes.status === 403) return onForbidden();
    const [membersData, candidatesData] = await Promise.all([membersRes.json(), candidatesRes.json()]);
    if (membersRes.ok) setMembers(membersData.members);
    if (candidatesRes.ok) setCandidates(candidatesData.users);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const memberIds = new Set((members ?? []).map((m) => m.userId));
  const filteredCandidates = useMemo(() => {
    const available = candidates.filter((u) => !memberIds.has(u.id));
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (c) => `${c.name} ${c.surname ?? ""}`.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, query, members]);

  async function addMember(c: Candidate) {
    setAdding(c.id);
    try {
      const res = await fetch("/api/social/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: c.id }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't add member", data.error);
      toast.success("Added to Social Media team", `${c.name} ${c.surname ?? ""}`.trim());
      load();
    } finally {
      setAdding(null);
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSaving(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: "DEPARTMENT_USER",
          departmentId: null,
          socialMediaAdmin: inviteRole === "ADMIN",
          socialMediaMember: inviteRole === "MEMBER",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(data.error ?? "Something went wrong");
        toast.error("Couldn't send invite", data.error);
        return;
      }
      setInviteOpen(false);
      if (data.emailSent === false) {
        toast.error("Invite created, but the email couldn't be sent", "Copy the link and share it manually.");
        if (data.acceptUrl) navigator.clipboard.writeText(data.acceptUrl).catch(() => {});
      } else {
        toast.success(`Invite sent to ${inviteEmail}`);
      }
    } finally {
      setInviteSaving(false);
    }
  }

  function openEdit(member: Member) {
    setEditTarget(member);
    setEditRole(member.isLead ? "ADMIN" : "MEMBER");
  }

  async function saveEdit() {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/social/members/${editTarget.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLead: editRole === "ADMIN" }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't update member", data.error);
      setEditTarget(null);
      toast.success("Member updated");
      load();
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const res = await fetch(`/api/social/members/${removeTarget.userId}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove member");
    toast.success(`${removeTarget.user.name} removed from Social Media team`);
    setRemoveTarget(null);
    load();
  }

  if (members === null) return <SkeletonForm fields={3} />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="w-24 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No one&apos;s on the Social Media team yet.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.userId} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">
                      {m.user.name} {m.user.surname ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.user.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={m.isLead ? "default" : "secondary"}>{m.isLead ? "Social Media (Admin)" : "Social Media User"}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="Edit">
                          <button
                            type="button"
                            aria-label={`Edit ${m.user.name}`}
                            onClick={() => openEdit(m)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                          >
                            <IconPencil className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip label="Remove">
                          <button
                            type="button"
                            aria-label={`Remove ${m.user.name}`}
                            onClick={() => setRemoveTarget(m)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
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
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Social Media Team</DialogTitle>
            <DialogDescription>Pick someone already in Aina CRM.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" autoFocus />
            <div className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {filteredCandidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No one to show.</p>
              ) : (
                filteredCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={adding === c.id}
                    onClick={() => addMember(c)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary/5 disabled:opacity-50"
                  >
                    <UserAvatar name={c.name} className="h-7 w-7 shrink-0 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {c.name} {c.surname ?? ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                    </span>
                    {adding === c.id && <span className="text-xs text-muted-foreground">Adding...</span>}
                  </button>
                ))
              )}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.user.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-role">Role</Label>
              <Dropdown id="member-role" value={editRole} onChange={setEditRole} options={MEMBER_ROLE_OPTIONS} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a new user</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="team-invite-form" onSubmit={submitInvite} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Dropdown id="invite-role" value={inviteRole} onChange={setInviteRole} options={MEMBER_ROLE_OPTIONS} />
              </div>
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="team-invite-form" disabled={inviteSaving}>
              {inviteSaving ? "Sending..." : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.user.name} from the Social Media team?`}
        description="They'll lose access to the module immediately. Clients they created or are assigned to stay as they are."
        onConfirm={confirmRemove}
      />
    </div>
  );
}

// ---------- Attendance ----------

interface AttendanceRow {
  id: string;
  user: { id: string; name: string; surname: string | null; email: string };
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number | null;
  status: string | null;
  calculatedStatus: string | null;
  statusOverride: boolean;
  overrideReason: string | null;
  halfDayReason: string | null;
  adminNote: string | null;
  approvalStatus: string;
}

const APPROVAL_BADGE: Record<string, "success" | "default" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "default",
  REJECTED: "destructive",
};

const ATTENDANCE_STATUS_OPTIONS = [
  { value: "PRESENT", label: "Present" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ABSENT", label: "Absent" },
];
const HALF_DAY_REASON_OPTIONS = Object.entries(HALF_DAY_REASON_LABEL).map(([value, label]) => ({ value, label }));

/**
 * Same mark/approve/reject/override actions a company Admin has in
 * /admin/attendance, scoped here to the lead's own team — the backing
 * routes (PATCH /api/attendance/[id], POST .../approve) already enforce
 * that scoping server-side (see sharesLedTeamWith in src/lib/teams.ts),
 * this is just the matching UI.
 */
function AttendanceTab() {
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/social/team-attendance?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't load attendance", data.error);
    setRows(data.records ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(row: AttendanceRow, decision: "APPROVED" | "REJECTED") {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/attendance/${row.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't update approval", data.error);
      toast.success(decision === "APPROVED" ? "Approved" : "Rejected");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) return <SkeletonForm fields={3} />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-5">
          <div className="w-64">
            <Label className="mb-1.5 block text-xs text-muted-foreground">Date range</Label>
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Check-in</th>
                <th className="px-4 py-2.5 font-medium">Check-out</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Approval</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No attendance records for this range.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">
                      {r.user.name} {r.user.surname ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.date}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={r.status as AttendanceStatus | null} working={!!r.checkIn && !r.checkOut} />
                        {r.statusOverride && (
                          <span
                            className="text-[10px] text-muted-foreground"
                            title={`System calculated ${r.calculatedStatus ? STATUS_LABEL[r.calculatedStatus as AttendanceStatus] : "—"}${r.overrideReason ? ` · ${r.overrideReason}` : ""}`}
                          >
                            (override)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={APPROVAL_BADGE[r.approvalStatus] ?? "secondary"}>{r.approvalStatus}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {r.approvalStatus !== "APPROVED" && r.status && (
                          <Tooltip label="Approve">
                            <Button type="button" size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => decide(r, "APPROVED")}>
                              <IconCheck className="h-4 w-4 text-emerald-500" />
                            </Button>
                          </Tooltip>
                        )}
                        {r.approvalStatus !== "REJECTED" && r.status && (
                          <Tooltip label="Reject">
                            <Button type="button" size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => decide(r, "REJECTED")}>
                              <IconX className="h-4 w-4 text-red-500" />
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip label="Override / edit">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(r)}>
                            <IconPencil className="h-3.5 w-3.5" />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <AttendanceOverrideDialog
          key={editing.id}
          open
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AttendanceOverrideDialog({
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
  record: AttendanceRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<string>(record.status ?? "PRESENT");
  const [halfDayReason, setHalfDayReason] = useState<string>(record.halfDayReason ?? "MANUAL_ADJUSTMENT");
  const [overrideReason, setOverrideReason] = useState(record.overrideReason ?? "");
  const [adminNote, setAdminNote] = useState(record.adminNote ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/attendance/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          halfDayReason: status === "HALF_DAY" ? halfDayReason : null,
          overrideReason: overrideReason.trim() || null,
          adminNote: adminNote.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save", json.error);
      toast.success("Attendance updated");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override attendance</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {[record.user.name, record.user.surname].filter(Boolean).join(" ")} · {record.date}
              {record.calculatedStatus && (
                <>
                  {" "}
                  · System calculated{" "}
                  <span className="font-medium text-foreground">
                    {STATUS_LABEL[record.calculatedStatus as AttendanceStatus]}
                  </span>
                </>
              )}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Dropdown value={status} onChange={setStatus} options={ATTENDANCE_STATUS_OPTIONS} />
            </div>
            {status === "HALF_DAY" && (
              <div className="flex flex-col gap-1.5">
                <Label>Half day reason</Label>
                <Dropdown value={halfDayReason} onChange={setHalfDayReason} options={HALF_DAY_REASON_OPTIONS} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sm-ov-reason">Override reason</Label>
              <Input
                id="sm-ov-reason"
                placeholder="Why is this being changed?"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sm-ov-note">Note</Label>
              <Input id="sm-ov-note" placeholder="Optional" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={save}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Activity ----------

interface ActivityLog {
  id: string;
  model: string;
  action: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
}

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  update: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  delete: "bg-destructive/15 text-destructive",
};

function ActivityTab() {
  const toast = useToast();
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/social/team-activity");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't load team activity", data.error);
    setLogs(data.logs ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !logs) return logs ?? [];
    return logs.filter(
      (l) => l.summary.toLowerCase().includes(q) || l.model.toLowerCase().includes(q) || (l.actorName ?? "").toLowerCase().includes(q)
    );
  }, [logs, query]);

  if (logs === null) return <SkeletonForm fields={3} />;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>
          Team activity
          <span className="ml-2 text-sm font-normal text-muted-foreground">{filtered.length}</span>
        </CardTitle>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the team's activity…" className="sm:w-64" />
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? "Nothing recorded yet." : "Nothing matches that search."}
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">When</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">Action</th>
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">What</th>
                  <th className="sticky top-0 z-10 hidden whitespace-nowrap bg-card px-2 py-2 font-medium sm:table-cell">Module</th>
                  <th className="sticky top-0 z-10 hidden whitespace-nowrap bg-card px-2 py-2 font-medium sm:table-cell">By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-2 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ACTION_STYLE[log.action] ?? "bg-muted text-muted-foreground")}>
                        {log.action}
                      </span>
                    </td>
                    <td className="max-w-[320px] truncate px-2 py-2">{log.summary}</td>
                    <td className="hidden whitespace-nowrap px-2 py-2 text-muted-foreground sm:table-cell">{log.model}</td>
                    <td className="hidden whitespace-nowrap px-2 py-2 text-muted-foreground sm:table-cell">{log.actorName ?? "system"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
