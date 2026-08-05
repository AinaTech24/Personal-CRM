"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { SkeletonForm } from "@/components/ui/skeleton";
import { IconPencil, IconTrash, IconSend } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { userOptionLabel } from "@/lib/user-display";
import { cn } from "@/lib/utils";

type TabKey = "members" | "attendance" | "activity";

const TABS: { key: TabKey; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "attendance", label: "Attendance" },
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
 * (via the admin nav) or by the team's own lead (via their own nav), unlike
 * every other /admin/* page which is Admin-only at the layout level. Manages
 * membership (including inviting brand-new users straight into the team),
 * and gives the lead a team-scoped view of Attendance and CRM-wide Activity
 * — the same underlying data an Admin sees company-wide, filtered to just
 * this team so a lead never sees another department's records.
 */
export default function SocialMediaTeamPage() {
  const [tab, setTab] = useState<TabKey>("members");
  const [forbidden, setForbidden] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Social Media Team</h1>
        <p className="text-sm text-muted-foreground">
          Manage who&apos;s on the team, and see their attendance and activity across the whole CRM — scoped to this
          team only.
        </p>
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
          {tab === "members" && <MembersTab onForbidden={() => setForbidden(true)} />}
          {tab === "attendance" && <AttendanceTab />}
          {tab === "activity" && <ActivityTab />}
        </>
      )}
    </div>
  );
}

// ---------- Members ----------

function MembersTab({ onForbidden }: { onForbidden: () => void }) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState("MEMBER");
  const [editSaving, setEditSaving] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);

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
  const candidateOptions = candidates.filter((u) => !memberIds.has(u.id)).map((u) => ({ value: u.id, label: userOptionLabel(u) }));

  async function addMember() {
    if (!addUserId) return;
    setAdding(true);
    try {
      const res = await fetch("/api/social/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addUserId }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't add member", data.error);
      setAddUserId("");
      toast.success("Added to Social Media team");
      load();
    } finally {
      setAdding(false);
    }
  }

  function openInvite() {
    setInviteEmail("");
    setInviteRole("MEMBER");
    setInviteError(null);
    setInviteOpen(true);
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
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error ?? "Something went wrong");
        toast.error("Couldn't send invite", data.error);
        return;
      }
      setInviteOpen(false);
      toast.success(`Invite sent to ${inviteEmail}`);
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
        <CardContent className="flex flex-wrap items-end gap-3 p-5">
          <div className="w-64">
            <Label htmlFor="team-add-existing" className="mb-1.5 block text-xs text-muted-foreground">
              Add an existing user
            </Label>
            <Dropdown id="team-add-existing" value={addUserId} onChange={setAddUserId} placeholder="Choose a user" options={candidateOptions} />
          </div>
          <Button size="sm" onClick={addMember} disabled={!addUserId || adding}>
            {adding ? "Adding..." : "Add to team"}
          </Button>
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={openInvite}>
            <IconSend className="h-4 w-4" />
            Invite new user
          </Button>
        </CardContent>
      </Card>

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
  calculatedStatus: string;
  approvalStatus: string;
}

const APPROVAL_BADGE: Record<string, "success" | "default" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "default",
  REJECTED: "destructive",
};

function AttendanceTab() {
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
                    <td className="px-4 py-2.5">{r.calculatedStatus.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={APPROVAL_BADGE[r.approvalStatus] ?? "secondary"}>{r.approvalStatus}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
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
