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
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SkeletonForm } from "@/components/ui/skeleton";
import { IconPencil, IconTrash, IconCheck, IconX, IconPlus, IconShield, IconSend } from "@/components/icons";
import { ManagePermissionsDialog } from "@/components/permissions/manage-permissions-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/attendance/status-badge";
import { HALF_DAY_REASON_LABEL, STATUS_LABEL } from "@/lib/attendance-ui";
import { LeadsBoard } from "@/components/leads/leads-board";
import { TasksBoard } from "@/components/tasks/tasks-board";
import { MeetingsView } from "@/components/meetings/meetings-view";
import { ProjectsList } from "@/components/projects/projects-list";
import { LeaveAdminView } from "@/components/leave/leave-admin-view";

type TabKey = "members" | "leads" | "tasks" | "meetings" | "projects" | "attendance" | "leave" | "activity";

const TABS: { key: TabKey; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "leads", label: "Leads" },
  { key: "tasks", label: "Tasks" },
  { key: "meetings", label: "Meetings" },
  { key: "projects", label: "Projects" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "activity", label: "Activity" },
];

interface Member {
  isLead: boolean;
  user: { id: string; name: string; surname: string | null; email: string; avatarDataUrl: string | null; role: string; isActive: boolean };
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  disabled: boolean;
  members: Member[];
}

interface Candidate {
  id: string;
  name: string;
  surname: string | null;
  email: string;
}

function fullName(u: { name: string; surname?: string | null }) {
  return [u.name, u.surname].filter(Boolean).join(" ");
}

/**
 * The console for any non-system team (reachable via /teams/[id]) — same
 * tabbed shape as CrmTeamConsole/SocialMediaTeamConsole (which keep their
 * own dedicated consoles for their extra Calls/Pipeline tabs), generalized
 * to any team by id via the `scope=team:<id>` query param Leads/Tasks/
 * Meetings/Projects already understand, and the matching
 * /api/teams/[id]/attendance + /activity routes.
 */
export function GenericTeamConsole({ teamId }: { teamId: string }) {
  const [tab, setTab] = useState<TabKey>("members");
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const [teamRes, meRes] = await Promise.all([fetch(`/api/teams/${teamId}`), fetch("/api/auth/me")]);
    const teamData = await teamRes.json().catch(() => ({}));
    if (!teamRes.ok) {
      setLoadError(teamData.error ?? "Couldn't load this team");
      return;
    }
    setTeam(teamData.team);
    if (meRes.ok) {
      const me = (await meRes.json()).user;
      setIsAdmin(me?.role === "SUPER_ADMIN" || me?.role === "ADMIN");
      setMeId(me?.id ?? null);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const myMembership = team?.members.find((m) => m.user.id === meId);
  const canManage = isAdmin || !!myMembership?.isLead;

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }
  if (!team) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{team.name}</h1>
            {team.disabled && <Badge variant="destructive">Disabled</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Manage who&apos;s on the team, and see their work across the CRM — scoped to this team only.
          </p>
        </div>
        {tab === "members" && canManage && (
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

      {tab === "members" && (
        <MembersTab
          teamId={teamId}
          team={team}
          meId={meId}
          canManage={canManage}
          addOpen={addOpen}
          setAddOpen={setAddOpen}
          inviteOpen={inviteOpen}
          setInviteOpen={setInviteOpen}
          reload={load}
        />
      )}
      {tab === "leads" && <LeadsBoard scope={`team:${teamId}`} />}
      {tab === "tasks" && <TasksBoard scope={`team:${teamId}`} />}
      {tab === "meetings" && <MeetingsView scope={`team:${teamId}`} />}
      {tab === "projects" && <ProjectsList scope={`team:${teamId}`} />}
      {tab === "attendance" && <AttendanceTab teamId={teamId} />}
      {tab === "leave" && <LeaveAdminView canEditDelete={false} />}
      {tab === "activity" && <ActivityTab teamId={teamId} />}
    </div>
  );
}

// ---------- Members ----------

const TEAM_MEMBER_ROLE_OPTIONS = [
  { value: "MEMBER", label: "Member" },
  { value: "LEAD", label: "Lead" },
];

function MembersTab({
  teamId,
  team,
  meId,
  canManage,
  addOpen,
  setAddOpen,
  inviteOpen,
  setInviteOpen,
  reload,
}: {
  teamId: string;
  team: TeamDetail;
  meId: string | null;
  canManage: boolean;
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
  inviteOpen: boolean;
  setInviteOpen: (v: boolean) => void;
  reload: () => void;
}) {
  const toast = useToast();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [permsUser, setPermsUser] = useState<{ id: string; name: string; surname?: string | null } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);

  useEffect(() => {
    if (!addOpen) return;
    setQuery("");
    setCandidates(null);
    fetch(`/api/teams/${teamId}/candidates`)
      .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => setCandidates(ok ? data.users : []));
  }, [addOpen, teamId]);

  useEffect(() => {
    if (!inviteOpen) return;
    setInviteEmail("");
    setInviteRole("MEMBER");
    setInviteError(null);
  }, [inviteOpen]);

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
          teamId,
          teamIsLead: inviteRole === "LEAD",
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

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates ?? [];
    return (candidates ?? []).filter((c) => fullName(c).toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [candidates, query]);

  async function addMember(c: Candidate) {
    setAdding(c.id);
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't add them", data.error);
      toast.success("Added to team", fullName(c));
      setCandidates((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
      reload();
    } finally {
      setAdding(null);
    }
  }

  async function toggleLead(m: Member) {
    const res = await fetch(`/api/teams/${teamId}/members/${m.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLead: !m.isLead }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't update their role", data.error);
    reload();
  }

  async function confirmRemove() {
    if (!removing) return;
    const res = await fetch(`/api/teams/${teamId}/members/${removing.user.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error("Couldn't remove them", data.error);
    else toast.success("Removed from team", fullName(removing.user));
    setRemoving(null);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="divide-y p-0">
          {team.members.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No members yet{canManage ? " — add someone to get started." : "."}</p>
          )}
          {team.members.map((m) => {
            const isSelf = m.user.id === meId;
            return (
              <div key={m.user.id} className="flex items-center gap-3 p-4">
                <UserAvatar name={m.user.name} avatarDataUrl={m.user.avatarDataUrl} className="h-9 w-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fullName(m.user)}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                {!m.user.isActive && <Badge variant="destructive">Blocked</Badge>}
                {canManage ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Lead
                    <ToggleSwitch checked={m.isLead} onChange={() => toggleLead(m)} label={`${fullName(m.user)} is a team lead`} />
                  </label>
                ) : (
                  m.isLead && <Badge variant="success">Lead</Badge>
                )}
                {canManage && (
                  <div className="flex items-center gap-0.5 border-l border-border pl-2">
                    {!isSelf && (
                      <Tooltip label="Manage permissions" side="bottom">
                        <button
                          type="button"
                          onClick={() => setPermsUser(m.user)}
                          aria-label={`Manage permissions for ${fullName(m.user)}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                        >
                          <IconShield className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip label="Remove from team" side="bottom">
                      <button
                        type="button"
                        onClick={() => setRemoving(m)}
                        aria-label={`Remove ${fullName(m.user)} from team`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to {team.name}</DialogTitle>
            <DialogDescription>Pick someone already in Aina CRM.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" autoFocus />
            <div className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {candidates === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
              ) : filteredCandidates.length === 0 ? (
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
                      <span className="block truncate font-medium">{fullName(c)}</span>
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

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a new user</DialogTitle>
            <DialogDescription>Email them an invite straight into {team.name}.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form id="team-invite-form" onSubmit={submitInvite} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="generic-team-invite-email">Email</Label>
                <Input
                  id="generic-team-invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="generic-team-invite-role">Role</Label>
                <Dropdown id="generic-team-invite-role" value={inviteRole} onChange={setInviteRole} options={TEAM_MEMBER_ROLE_OPTIONS} />
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

      <ManagePermissionsDialog user={permsUser} onOpenChange={(open) => !open && setPermsUser(null)} />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove ${removing ? fullName(removing.user) : ""} from ${team.name}?`}
        description="They'll lose whatever access this team membership granted them."
        confirmLabel="Remove"
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
 * /admin/attendance, scoped here to the team's own lead — the backing
 * routes (PATCH /api/attendance/[id], POST .../approve) already enforce
 * that scoping server-side (see sharesLedTeamWith in src/lib/teams.ts),
 * this is just the matching UI.
 */
function AttendanceTab({ teamId }: { teamId: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/teams/${teamId}/attendance?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) return setForbidden(true);
    if (!res.ok) return toast.error("Couldn't load attendance", data.error);
    setRows(data.records ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, from, to]);

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

  if (forbidden) {
    return (
      <Card className="flex flex-col items-center justify-center gap-1 py-16 text-center">
        <p className="text-sm font-medium">You don&apos;t have access to this team&apos;s Attendance</p>
        <p className="text-sm text-muted-foreground">Ask your team lead or a company admin for access.</p>
      </Card>
    );
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
              <Label htmlFor="team-ov-reason">Override reason</Label>
              <Input
                id="team-ov-reason"
                placeholder="Why is this being changed?"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-ov-note">Note</Label>
              <Input id="team-ov-note" placeholder="Optional" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
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

function ActivityTab({ teamId }: { teamId: string }) {
  const toast = useToast();
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/activity`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) return setForbidden(true);
    if (!res.ok) return toast.error("Couldn't load team activity", data.error);
    setLogs(data.logs ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

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

  if (forbidden) {
    return (
      <Card className="flex flex-col items-center justify-center gap-1 py-16 text-center">
        <p className="text-sm font-medium">You don&apos;t have access to this team&apos;s Activity</p>
        <p className="text-sm text-muted-foreground">Ask your team lead or a company admin for access.</p>
      </Card>
    );
  }

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
